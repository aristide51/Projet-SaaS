"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { signOut } from "@/features/auth/actions";

export function SignOutButton() {
  const router = useRouter();
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

      router.replace(result.redirectTo ?? "/auth/login");
      router.refresh();
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
