"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { FormField, Input } from "@/components/ui/primitives";
import {
  sendMagicLink,
  sendPasswordReset,
  signIn,
  signInWithGoogle,
  signUp,
  updatePassword,
  type AuthActionResult,
} from "@/features/auth/actions";
import {
  createAuthFormSchema,
  type AuthFormValues,
} from "@/features/auth/form-schema";
import { TurnstileWidget } from "@/features/auth/turnstile-widget";

export type AuthMode = "login" | "signup" | "magic" | "forgot" | "reset";

const modeContent: Record<AuthMode, { title: string; description: string }> = {
  login: {
    title: "Content de te revoir",
    description: "Connecte-toi pour retrouver tes boutiques et tes commandes.",
  },
  signup: {
    title: "Créer un compte",
    description: "Rejoins les commerces locaux du Burkina Faso.",
  },
  magic: {
    title: "Connexion par e-mail",
    description: "Reçois un lien sécurisé pour te connecter sans mot de passe.",
  },
  forgot: {
    title: "Mot de passe oublié",
    description:
      "Nous t’enverrons un lien pour choisir un nouveau mot de passe.",
  },
  reset: {
    title: "Choisir un nouveau mot de passe",
    description: "Choisis un mot de passe d’au moins 8 caractères.",
  },
};

type AuthFormProps = {
  mode: AuthMode;
  siteKey: string;
  nonce: string;
  next: string;
};

function ResultMessage({ result }: { result: AuthActionResult | null }) {
  if (!result) {
    return null;
  }

  return (
    <p
      className={result.success ? "auth-form__success" : "auth-form__error"}
      role={result.success ? "status" : "alert"}
    >
      {result.success ? result.message : result.message}
    </p>
  );
}

export function AuthForm({ mode, siteKey, nonce, next }: AuthFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<AuthActionResult | null>(null);
  const [captchaError, setCaptchaError] = useState("");
  const [widgetKey, setWidgetKey] = useState(0);
  const schema = createAuthFormSchema(mode);
  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<AuthFormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      fullName: "",
      email: "",
      password: "",
      turnstileToken: "",
      next,
    },
  });

  const onToken = useCallback(
    (token: string) => {
      setValue("turnstileToken", token, {
        shouldDirty: true,
        shouldValidate: true,
      });
      if (token) {
        setCaptchaError("");
      }
    },
    [setValue],
  );

  const onCaptchaError = useCallback(
    (message: string) => {
      setCaptchaError(message);
      setValue("turnstileToken", "", { shouldValidate: true });
    },
    [setValue],
  );

  function showResult(actionResult: AuthActionResult) {
    setResult(actionResult);
    setValue("turnstileToken", "");
    setWidgetKey((current) => current + 1);

    if (actionResult.success && actionResult.redirectTo) {
      router.replace(actionResult.redirectTo);
      router.refresh();
    }
  }

  function submit(values: AuthFormValues) {
    setResult(null);
    setCaptchaError("");
    startTransition(async () => {
      let actionResult: AuthActionResult;

      switch (mode) {
        case "signup":
          actionResult = await signUp(values);
          break;
        case "login":
          actionResult = await signIn(values);
          break;
        case "magic":
          actionResult = await sendMagicLink(values);
          break;
        case "forgot":
          actionResult = await sendPasswordReset(values);
          break;
        case "reset":
          actionResult = await updatePassword(values);
          break;
      }

      showResult(actionResult);
    });
  }

  function continueWithGoogle() {
    const token = formToken();

    if (!token) {
      setCaptchaError("Confirme le contrôle anti-robot avant de continuer.");
      return;
    }

    startTransition(async () => {
      const actionResult = await signInWithGoogle({
        turnstileToken: token,
        next,
      });

      if (actionResult.success && actionResult.redirectTo) {
        window.location.assign(actionResult.redirectTo);
        return;
      }

      showResult(actionResult);
    });
  }

  function formToken() {
    return document.querySelector<HTMLInputElement>(
      'input[name="turnstileToken"]',
    )?.value;
  }

  const content = modeContent[mode];
  const inputEmail = mode !== "reset";
  const inputPassword = ["signup", "login", "reset"].includes(mode);
  const hasEmail = ["login", "signup", "magic", "forgot"].includes(mode);

  return (
    <section aria-labelledby="auth-title" className="auth-card">
      <p className="auth-eyebrow">Faso · commerces locaux</p>
      <h1 id="auth-title">{content.title}</h1>
      <p className="auth-description">{content.description}</p>

      <form className="auth-form" noValidate onSubmit={handleSubmit(submit)}>
        {mode === "signup" ? (
          <FormField
            {...(errors.fullName?.message
              ? { error: errors.fullName.message }
              : {})}
            label="Nom complet"
          >
            <Input
              autoComplete="name"
              autoCapitalize="words"
              {...register("fullName")}
            />
          </FormField>
        ) : null}

        {inputEmail && hasEmail ? (
          <FormField
            {...(errors.email?.message ? { error: errors.email.message } : {})}
            label="Adresse e-mail"
          >
            <Input
              autoComplete="email"
              autoCapitalize="none"
              inputMode="email"
              type="email"
              {...register("email")}
            />
          </FormField>
        ) : null}

        {inputPassword ? (
          <FormField
            {...(errors.password?.message
              ? { error: errors.password.message }
              : {})}
            label={mode === "reset" ? "Nouveau mot de passe" : "Mot de passe"}
          >
            <Input
              autoComplete={
                mode === "login" ? "current-password" : "new-password"
              }
              type="password"
              {...register("password")}
            />
          </FormField>
        ) : null}

        <input type="hidden" {...register("turnstileToken")} />
        <TurnstileWidget
          key={widgetKey}
          nonce={nonce}
          onError={onCaptchaError}
          onToken={onToken}
          siteKey={siteKey}
          widgetKey={widgetKey}
        />
        {captchaError ? (
          <p className="auth-form__error" role="alert">
            {captchaError}
          </p>
        ) : null}
        {errors.turnstileToken?.message ? (
          <p className="auth-form__error" role="alert">
            {errors.turnstileToken.message}
          </p>
        ) : null}

        <button
          className="ui-button ui-button--primary ui-button--lg auth-form__submit"
          disabled={isPending || !siteKey}
          type="submit"
        >
          {isPending ? "Patiente…" : submitLabel(mode)}
        </button>

        {mode === "login" ? (
          <>
            <button
              className="ui-button ui-button--secondary ui-button--lg auth-form__submit"
              disabled={isPending || !siteKey}
              onClick={continueWithGoogle}
              type="button"
            >
              Continuer avec Google
            </button>
            <Link
              className="auth-link"
              href={withNext("/auth/magic-link", next)}
            >
              Recevoir un lien de connexion
            </Link>
          </>
        ) : null}

        <ResultMessage result={result} />
      </form>

      <AuthLinks mode={mode} next={next} />
    </section>
  );
}

function submitLabel(mode: AuthMode) {
  switch (mode) {
    case "signup":
      return "Créer mon compte";
    case "login":
      return "Se connecter";
    case "magic":
      return "M’envoyer un lien";
    case "forgot":
      return "Envoyer le lien";
    case "reset":
      return "Modifier le mot de passe";
  }
}

function withNext(path: string, next: string) {
  return `${path}?next=${encodeURIComponent(next)}`;
}

function AuthLinks({ mode, next }: { mode: AuthMode; next: string }) {
  return (
    <nav aria-label="Liens d’authentification" className="auth-links">
      {mode === "login" ? (
        <>
          <Link href={withNext("/auth/forgot-password", next)}>
            Mot de passe oublié ?
          </Link>
          <Link href="/auth/signup">Créer un compte</Link>
        </>
      ) : null}
      {mode === "signup" ? (
        <Link href={withNext("/auth/login", next)}>
          Tu as déjà un compte ? Se connecter
        </Link>
      ) : null}
      {["magic", "forgot", "reset"].includes(mode) ? (
        <Link href={withNext("/auth/login", next)}>Retour à la connexion</Link>
      ) : null}
    </nav>
  );
}
