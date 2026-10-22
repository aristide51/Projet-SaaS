"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createOnboardingShop } from "./actions";

export function OnboardingStarter() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");

  function startOnboarding() {
    setError("");
    startTransition(async () => {
      const result = await createOnboardingShop();

      if (!result.success || !result.shopId) {
        setError(result.message);
        return;
      }

      router.push(
        `/dashboard/onboarding?shop=${encodeURIComponent(result.shopId)}`,
      );
      router.refresh();
    });
  }

  return (
    <main className="onboarding-shell">
      <section className="onboarding-card">
        <p className="auth-eyebrow">Espace commerçant</p>
        <h1>Crée ta boutique</h1>
        <p>
          Quelques étapes suffisent pour préparer une vitrine adaptée à ton
          commerce.
        </p>
        {error ? (
          <p className="auth-form__error" role="alert">
            {error}
          </p>
        ) : null}
        <button
          className="ui-button ui-button--primary ui-button--lg"
          disabled={isPending}
          onClick={startOnboarding}
          type="button"
        >
          {isPending ? "Préparation…" : "Commencer"}
        </button>
      </section>
    </main>
  );
}
