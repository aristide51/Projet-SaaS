"use server";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { headers } from "next/headers";
import { z } from "zod";
import { logError } from "@/lib/monitoring/sentry";
import { getSafeRedirectPath } from "@/lib/auth/redirect";
import {
  clearReauthPending,
  isReauthConfigured,
  setReauthPending,
  setReauthProof,
} from "@/lib/security/reauth";
import { validateServerEnv } from "@/lib/env";
import { createClient, getUser } from "@/lib/supabase/server";

export type ReauthActionResult =
  { success: true; message: string } | { success: false; message: string };

const passwordSchema = z.string().min(1).max(72);

function failure(message: string): ReauthActionResult {
  return { success: false, message };
}

export async function reauthenticateWithPassword(
  formData: FormData,
): Promise<ReauthActionResult> {
  if (!isReauthConfigured()) {
    return failure("La vérification renforcée n’est pas configurée.");
  }

  const parsed = passwordSchema.safeParse(formData.get("password"));

  if (!parsed.success) {
    return failure("Saisis ton mot de passe.");
  }

  try {
    const user = await getUser();

    if (!user?.email || !user.email_confirmed_at) {
      return failure("Connecte-toi avec une adresse e-mail confirmée.");
    }

    const { NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY } =
      validateServerEnv();
    const verifier = createSupabaseClient(
      NEXT_PUBLIC_SUPABASE_URL,
      NEXT_PUBLIC_SUPABASE_ANON_KEY,
      {
        auth: {
          autoRefreshToken: false,
          detectSessionInUrl: false,
          persistSession: false,
        },
      },
    );
    const { data, error } = await verifier.auth.signInWithPassword({
      email: user.email,
      password: parsed.data,
    });

    if (error || !data.user || data.user.id !== user.id) {
      return failure("Mot de passe incorrect. Réessaie.");
    }

    if (!data.user.email_confirmed_at) {
      return failure("Confirme ton adresse e-mail avant de continuer.");
    }

    await setReauthProof(user.id);
    return { success: true, message: "Identité confirmée." };
  } catch (error) {
    await logError("reauth_password_failed", error);
    return failure("La vérification a échoué. Réessaie plus tard.");
  }
}

export async function requestReauthMagicLink(): Promise<ReauthActionResult> {
  if (!isReauthConfigured()) {
    return failure("La vérification renforcée n’est pas configurée.");
  }

  try {
    const user = await getUser();

    if (!user?.email || !user.email_confirmed_at) {
      return failure("Connecte-toi avec une adresse e-mail confirmée.");
    }

    const requestHeaders = await headers();
    const origin = requestHeaders.get("origin");
    const host =
      requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
    const requestHost = host?.split(",")[0]?.trim();

    if (!origin || !requestHost) {
      return failure("Impossible de préparer le lien de vérification.");
    }

    const callbackOrigin = new URL(origin);

    if (callbackOrigin.host !== requestHost) {
      return failure("Impossible de préparer le lien de vérification.");
    }

    const callbackUrl = new URL("/auth/callback", callbackOrigin);
    callbackUrl.searchParams.set("next", getSafeRedirectPath("/account"));
    callbackUrl.searchParams.set("reauth", "1");

    await setReauthPending();
    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email: user.email,
      options: {
        shouldCreateUser: false,
        emailRedirectTo: callbackUrl.toString(),
      },
    });

    if (error) {
      await clearReauthPending();
      await logError("reauth_magic_link_failed", error);
      return failure("Le lien de vérification n’a pas pu être envoyé.");
    }

    return {
      success: true,
      message: "Un lien de vérification vient d’être envoyé à ton adresse.",
    };
  } catch (error) {
    await clearReauthPending();
    await logError("reauth_magic_link_failed", error);
    return failure("L’envoi du lien a échoué. Réessaie plus tard.");
  }
}
