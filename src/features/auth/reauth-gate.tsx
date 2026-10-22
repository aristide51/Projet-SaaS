"use client";

import { useState, useTransition, type ReactNode } from "react";
import { FormField, Input } from "@/components/ui/primitives";
import {
  reauthenticateWithPassword,
  requestReauthMagicLink,
  type ReauthActionResult,
} from "./reauth-actions";

type ReauthGateProps = {
  isVerified: boolean;
  children: ReactNode;
};

export function ReauthGate({ isVerified, children }: ReauthGateProps) {
  const [result, setResult] = useState<ReauthActionResult | null>(null);
  const [isPending, startTransition] = useTransition();
  const verified = isVerified || result?.success === true;

  function submitPassword(formData: FormData) {
    setResult(null);
    startTransition(async () => {
      const actionResult = await reauthenticateWithPassword(formData);
      setResult(actionResult);
    });
  }

  function sendMagicLink() {
    setResult(null);
    startTransition(async () => {
      setResult(await requestReauthMagicLink());
    });
  }

  if (verified) {
    return <>{children}</>;
  }

  return (
    <div className="reauth-gate" aria-labelledby="reauth-gate-title">
      <h3 id="reauth-gate-title">Confirme ton identité</h3>
      <p>
        Pour continuer, saisis ton mot de passe ou reçois un nouveau lien par
        e-mail.
      </p>
      <form action={submitPassword} className="auth-form">
        <FormField label="Mot de passe">
          <Input
            autoComplete="current-password"
            maxLength={72}
            name="password"
            required
            type="password"
          />
        </FormField>
        <button
          className="ui-button ui-button--primary"
          disabled={isPending}
          type="submit"
        >
          Vérifier le mot de passe
        </button>
      </form>
      <button
        className="ui-button ui-button--secondary"
        disabled={isPending}
        onClick={sendMagicLink}
        type="button"
      >
        Recevoir un lien de vérification
      </button>
      {result ? (
        <p
          role={result.success ? "status" : "alert"}
          className={result.success ? "auth-form__success" : "auth-form__error"}
        >
          {result.message}
        </p>
      ) : null}
    </div>
  );
}
