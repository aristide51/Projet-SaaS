"use client";

import { useState, useTransition } from "react";
import { signOut } from "@/features/auth/actions";
import { clearPrivateSnapshots } from "@/lib/pwa/private-data";

export function SignOutButton() {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");

  function handleSignOut() {
    setError("");
    startTransition(async () => {
      const result = await signOut();

      if (!result.success) {
        setError(result.message);
        return;
      }

      try {
        await clearPrivateSnapshots();
      } catch {
        setError(
          "Tu es déconnecté, mais les données hors ligne n’ont pas pu être effacées. Efface les données du site depuis les réglages du navigateur.",
        );
        return;
      }

      window.location.assign(result.redirectTo ?? "/auth/login");
    });
  }

  return (
    <div>
      <button
        className="ui-button ui-button--secondary"
        disabled={pending}
        onClick={handleSignOut}
        type="button"
      >
        {pending ? "Déconnexion…" : "Se déconnecter"}
      </button>
      {error ? (
        <p className="auth-form__error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
