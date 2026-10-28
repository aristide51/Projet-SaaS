"use client";

import { useState } from "react";
import { requestInvoiceReceipt } from "./actions";

export function InvoiceReceiptButton({
  invoiceId,
  status,
}: {
  invoiceId: string;
  status: "open" | "paid" | "void";
}) {
  const [pending, setPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function downloadReceipt() {
    setPending(true);
    setErrorMessage(null);
    try {
      const result = await requestInvoiceReceipt(invoiceId);
      if (!result.success) {
        setErrorMessage(result.message);
        return;
      }
      window.location.assign(result.signedUrl);
    } catch {
      setErrorMessage("Le PDF n’a pas pu être préparé. Réessaie plus tard.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div>
      <button
        className="ui-button ui-button--secondary"
        disabled={pending}
        onClick={downloadReceipt}
        type="button"
      >
        {pending
          ? "Préparation du PDF…"
          : status === "paid"
            ? "Télécharger le reçu PDF"
            : "Télécharger la facture PDF"}
      </button>
      {errorMessage ? (
        <p aria-live="polite" role="alert">
          {errorMessage}
        </p>
      ) : null}
    </div>
  );
}
