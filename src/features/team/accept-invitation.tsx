"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { acceptShopInvitation } from "./actions";

export function AcceptInvitation({ token }: { token: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function accept() {
    setBusy(true);
    setMessage("");
    setError("");
    const result = await acceptShopInvitation(token);
    setBusy(false);
    if (!result.success) {
      setError(result.message);
      return;
    }
    setMessage(result.message);
    router.replace(
      `/dashboard/team?shop=${encodeURIComponent(result.shopId ?? "")}`,
    );
    router.refresh();
  }

  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) {
    return <p role="alert">Ce lien d’invitation est invalide.</p>;
  }

  return (
    <section className="team-section">
      <p className="auth-eyebrow">Invitation d’équipe</p>
      <h1>Rejoindre une boutique</h1>
      <p>
        Connecte-toi avec l’adresse e-mail qui a reçu l’invitation. Le lien ne
        peut être utilisé qu’une fois.
      </p>
      {error ? (
        <p className="auth-form__error" role="alert">
          {error}
        </p>
      ) : null}
      {message ? (
        <p className="catalog-message" role="status">
          {message}
        </p>
      ) : null}
      <button
        className="ui-button ui-button--primary"
        disabled={busy}
        onClick={() => void accept()}
        type="button"
      >
        {busy ? "Vérification…" : "Accepter l’invitation"}
      </button>
    </section>
  );
}
