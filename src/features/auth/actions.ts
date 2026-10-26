"use server";

import { headers } from "next/headers";
import { logError } from "@/lib/monitoring/sentry";
import { getAuthErrorMessage } from "@/lib/errors";
import { getSafeRedirectPath } from "@/lib/auth/redirect";
import {
  clearReauthPending,
  clearReauthProof,
  isReauthConfigured,
  hasRecentReauthentication,
  setReauthPending,
} from "@/lib/security/reauth";
import { createClient } from "@/lib/supabase/server";
import { verifyTurnstileToken } from "@/lib/turnstile";
import { mergeGuestCartCookieIntoAccount } from "@/features/cart/data";
import {
  emailOnlySchema,
  resetPasswordSchema,
  signInSchema,
  signUpSchema,
} from "./schemas";

export type AuthActionResult =
  | { success: true; message?: string; redirectTo?: string }
  | { success: false; message: string };

function failure(message: string): AuthActionResult {
  return { success: false, message };
}

async function getCallbackUrl(nextPath: string, reauth = false) {
  const requestHeaders = await headers();
  const origin = requestHeaders.get("origin");
  const host =
    requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  const requestHost = host?.split(",")[0]?.trim();

  if (!origin || !requestHost) {
    return null;
  }

  try {
    const callbackOrigin = new URL(origin);

    if (callbackOrigin.host !== requestHost) {
      return null;
    }

    const callbackUrl = new URL("/auth/callback", callbackOrigin);
    callbackUrl.searchParams.set("next", getSafeRedirectPath(nextPath));
    if (reauth) {
      callbackUrl.searchParams.set("reauth", "1");
    }
    return callbackUrl.toString();
  } catch {
    return null;
  }
}

async function verifyChallenge(
  token: string,
): Promise<AuthActionResult | null> {
  if (
    !process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ||
    !process.env.TURNSTILE_SECRET_KEY
  ) {
    return failure(
      "La protection anti-robot n’est pas configurée. Réessaie plus tard.",
    );
  }

  try {
    const verified = await verifyTurnstileToken(token);

    return verified
      ? null
      : failure("La vérification anti-robot a échoué. Réessaie.");
  } catch (error) {
    await logError("auth_turnstile_verification_failed", error);
    return failure(
      "La vérification anti-robot est momentanément indisponible.",
    );
  }
}

export async function signUp(input: unknown): Promise<AuthActionResult> {
  const parsed = signUpSchema.safeParse(input);

  if (!parsed.success) {
    return failure(parsed.error.issues[0]?.message ?? "Vérifie les champs.");
  }

  const challengeError = await verifyChallenge(parsed.data.turnstileToken);

  if (challengeError) {
    return challengeError;
  }

  const callbackUrl = await getCallbackUrl(
    getSafeRedirectPath(parsed.data.next),
  );

  if (!callbackUrl) {
    return failure("Impossible de préparer le lien de confirmation.");
  }

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.signUp({
      email: parsed.data.email,
      password: parsed.data.password,
      options: {
        data: { full_name: parsed.data.fullName },
        emailRedirectTo: callbackUrl,
      },
    });

    if (error) {
      return failure(getAuthErrorMessage(error));
    }

    if (data.user && data.user.identities?.length === 0) {
      return {
        success: true,
        message:
          "Si cette adresse peut être utilisée, un lien de confirmation vient d’être envoyé.",
      };
    }

    return {
      success: true,
      message:
        "Compte créé. Consulte ta boîte e-mail et confirme ton adresse avant de te connecter.",
    };
  } catch (error) {
    await logError("auth_signup_failed", error);
    return failure("La création du compte a échoué. Réessaie plus tard.");
  }
}

export async function signIn(input: unknown): Promise<AuthActionResult> {
  const parsed = signInSchema.safeParse(input);

  if (!parsed.success) {
    return failure(parsed.error.issues[0]?.message ?? "Vérifie les champs.");
  }

  const challengeError = await verifyChallenge(parsed.data.turnstileToken);

  if (challengeError) {
    return challengeError;
  }

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.signInWithPassword({
      email: parsed.data.email,
      password: parsed.data.password,
    });

    if (error) {
      return failure(getAuthErrorMessage(error));
    }

    if (!data.user.email_confirmed_at) {
      await supabase.auth.signOut({ scope: "local" });
      return failure("Confirme ton adresse e-mail avant de te connecter.");
    }

    await mergeGuestCartCookieIntoAccount();

    return {
      success: true,
      redirectTo: getSafeRedirectPath(parsed.data.next),
    };
  } catch (error) {
    await logError("auth_signin_failed", error);
    return failure("La connexion a échoué. Réessaie plus tard.");
  }
}

export async function sendMagicLink(input: unknown): Promise<AuthActionResult> {
  const parsed = emailOnlySchema.safeParse(input);

  if (!parsed.success) {
    return failure(parsed.error.issues[0]?.message ?? "Vérifie les champs.");
  }

  const challengeError = await verifyChallenge(parsed.data.turnstileToken);

  if (challengeError) {
    return challengeError;
  }

  const callbackUrl = await getCallbackUrl(
    getSafeRedirectPath(parsed.data.next),
  );

  if (!callbackUrl) {
    return failure("Impossible de préparer le lien de connexion.");
  }

  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email: parsed.data.email,
      options: {
        shouldCreateUser: false,
        emailRedirectTo: callbackUrl,
      },
    });

    if (error) {
      return failure(getAuthErrorMessage(error));
    }

    return {
      success: true,
      message:
        "Si un compte existe pour cette adresse, un lien de connexion vient d’être envoyé.",
    };
  } catch (error) {
    await logError("auth_magic_link_failed", error);
    return failure("L’envoi du lien a échoué. Réessaie plus tard.");
  }
}

export async function sendPasswordReset(
  input: unknown,
): Promise<AuthActionResult> {
  const parsed = emailOnlySchema.safeParse(input);

  if (!parsed.success) {
    return failure(parsed.error.issues[0]?.message ?? "Vérifie les champs.");
  }

  const challengeError = await verifyChallenge(parsed.data.turnstileToken);

  if (challengeError) {
    return challengeError;
  }

  const callbackUrl = await getCallbackUrl("/auth/reset-password", true);

  if (!callbackUrl) {
    return failure("Impossible de préparer le lien de réinitialisation.");
  }

  if (!isReauthConfigured()) {
    return failure("La vérification renforcée n’est pas configurée.");
  }

  try {
    await setReauthPending();
    const supabase = await createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(
      parsed.data.email,
      { redirectTo: callbackUrl },
    );

    if (error) {
      await clearReauthPending();
      return failure(getAuthErrorMessage(error));
    }

    return {
      success: true,
      message:
        "Si un compte existe pour cette adresse, un lien de réinitialisation vient d’être envoyé.",
    };
  } catch (error) {
    await clearReauthPending();
    await logError("auth_password_reset_request_failed", error);
    return failure("L’envoi du lien a échoué. Réessaie plus tard.");
  }
}

export async function updatePassword(
  input: unknown,
): Promise<AuthActionResult> {
  const parsed = resetPasswordSchema.safeParse(input);

  if (!parsed.success) {
    return failure(parsed.error.issues[0]?.message ?? "Vérifie les champs.");
  }

  const challengeError = await verifyChallenge(parsed.data.turnstileToken);

  if (challengeError) {
    return challengeError;
  }

  try {
    const supabase = await createClient();
    const { data: userData, error: userError } = await supabase.auth.getUser();

    if (userError || !userData.user) {
      return failure("Le lien de réinitialisation est invalide ou expiré.");
    }

    if (!(await hasRecentReauthentication(userData.user.id))) {
      return failure("Le lien de réinitialisation est invalide ou expiré.");
    }

    const { error } = await supabase.auth.updateUser({
      password: parsed.data.password,
    });

    if (error) {
      return failure(getAuthErrorMessage(error));
    }

    await clearReauthProof();
    await supabase.auth.signOut({ scope: "local" });
    return {
      success: true,
      message:
        "Ton mot de passe a été modifié. Tu peux maintenant te connecter.",
    };
  } catch (error) {
    await logError("auth_password_update_failed", error);
    return failure("La modification du mot de passe a échoué.");
  }
}

export async function signInWithGoogle(
  input: unknown,
): Promise<AuthActionResult> {
  const parsed = emailOnlySchema
    .omit({ email: true })
    .extend({ next: signInSchema.shape.next })
    .safeParse(input);

  if (!parsed.success) {
    return failure(parsed.error.issues[0]?.message ?? "Vérifie les champs.");
  }

  const challengeError = await verifyChallenge(parsed.data.turnstileToken);

  if (challengeError) {
    return challengeError;
  }

  const callbackUrl = await getCallbackUrl(
    getSafeRedirectPath(parsed.data.next),
  );

  if (!callbackUrl) {
    return failure("Impossible de préparer la connexion Google.");
  }

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: callbackUrl },
    });

    if (error || !data.url) {
      return failure(
        error
          ? getAuthErrorMessage(error)
          : "La connexion Google est momentanément indisponible.",
      );
    }

    const authorizationUrl = new URL(data.url);
    const supabaseOrigin = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "")
      .origin;

    if (authorizationUrl.origin !== supabaseOrigin) {
      return failure("La connexion Google a renvoyé une adresse inattendue.");
    }

    return { success: true, redirectTo: authorizationUrl.toString() };
  } catch (error) {
    await logError("auth_google_signin_failed", error);
    return failure("La connexion Google a échoué. Réessaie plus tard.");
  }
}

export async function signOut(): Promise<AuthActionResult> {
  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.signOut({ scope: "local" });

    if (error) {
      return failure("La déconnexion a échoué. Réessaie.");
    }

    return { success: true, redirectTo: "/auth/login" };
  } catch (error) {
    await logError("auth_signout_failed", error);
    return failure("La déconnexion a échoué. Réessaie.");
  }
}
