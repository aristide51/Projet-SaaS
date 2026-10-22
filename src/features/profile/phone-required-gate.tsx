"use client";

import { useState, useTransition, type FormEvent, type ReactNode } from "react";
import { FormField, Input } from "@/components/ui/primitives";
import { saveProfilePhone, type ProfileActionResult } from "./actions";

type PhoneRequiredGateProps = {
  phone: string | null;
  children: ReactNode;
};

export function PhoneRequiredGate({ phone, children }: PhoneRequiredGateProps) {
  const [savedPhone, setSavedPhone] = useState(phone);
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<ProfileActionResult | null>(null);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setResult(null);

    startTransition(async () => {
      const actionResult = await saveProfilePhone(formData);
      setResult(actionResult);

      if (actionResult.success && actionResult.phone) {
        setSavedPhone(actionResult.phone);
      }
    });
  }

  if (savedPhone) {
    return children;
  }

  return (
    <section aria-labelledby="phone-required-title" className="auth-card">
      <p className="auth-eyebrow">Avant de continuer</p>
      <h2 id="phone-required-title">Ajoute ton numéro de téléphone</h2>
      <p className="auth-description">
        Il est nécessaire pour finaliser une commande ou une réservation.
      </p>
      <form className="auth-form" onSubmit={handleSubmit}>
        <FormField
          label="Téléphone burkinabè"
          hint="8 chiffres, par exemple 70 00 00 00."
        >
          <Input
            autoComplete="tel"
            inputMode="tel"
            name="phone"
            required
            type="tel"
          />
        </FormField>
        {result ? (
          <p
            className={
              result.success ? "auth-form__success" : "auth-form__error"
            }
            role={result.success ? "status" : "alert"}
          >
            {result.message}
          </p>
        ) : null}
        <button
          className="ui-button ui-button--primary ui-button--lg auth-form__submit"
          disabled={isPending}
          type="submit"
        >
          {isPending ? "Enregistrement…" : "Enregistrer et continuer"}
        </button>
      </form>
    </section>
  );
}
