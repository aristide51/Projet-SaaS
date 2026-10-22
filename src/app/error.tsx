"use client";

import { useEffect } from "react";
import { logError } from "@/lib/monitoring/sentry";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    void logError("app_error_boundary", error);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col items-start justify-center gap-4 px-6 py-16">
      <h1 className="text-3xl font-semibold">Une erreur est survenue.</h1>
      <p role="alert">
        La page n’a pas pu s’afficher. Réessaie dans un instant.
      </p>
      <button className="ui-button ui-button--primary" onClick={() => reset()}>
        Réessayer
      </button>
    </main>
  );
}
