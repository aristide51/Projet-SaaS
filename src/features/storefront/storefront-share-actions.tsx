"use client";

import { useRef, useState, type ReactNode } from "react";

type StorefrontShareActionsProps = {
  qrCode?: ReactNode;
  qrDownloadName: string;
  shareMessage: string;
  shareUrl: string;
};

export function StorefrontShareActions({
  qrCode,
  qrDownloadName,
  shareMessage,
  shareUrl,
}: StorefrontShareActionsProps) {
  const [status, setStatus] = useState("");
  const qrContainer = useRef<HTMLDivElement>(null);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setStatus("Lien copié.");
    } catch {
      setStatus("La copie a échoué. Utilise le bouton WhatsApp pour partager.");
    }
  }

  function downloadQrCode() {
    const svg = qrContainer.current?.querySelector("svg");
    if (!svg) {
      setStatus("Le QR code n’est pas encore prêt.");
      return;
    }

    const contents = new XMLSerializer().serializeToString(svg);
    const objectUrl = URL.createObjectURL(
      new Blob([contents], { type: "image/svg+xml;charset=utf-8" }),
    );
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = qrDownloadName;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    setStatus("QR code téléchargé.");
  }

  return (
    <>
      <div className="storefront-share__actions">
        <a
          className="ui-button ui-button--secondary"
          href={`https://wa.me/?text=${encodeURIComponent(shareMessage)}`}
          rel="noreferrer"
          target="_blank"
        >
          Partager sur WhatsApp
        </a>
        <button
          className="ui-button ui-button--secondary"
          onClick={() => void copyLink()}
          type="button"
        >
          Copier le lien
        </button>
      </div>
      {status ? (
        <p aria-live="polite" role="status">
          {status}
        </p>
      ) : null}
      {qrCode ? (
        <div className="storefront-share__qr">
          <div ref={qrContainer}>{qrCode}</div>
          <p>Scanne le QR code pour ouvrir la boutique.</p>
          <button
            className="ui-button ui-button--secondary"
            onClick={downloadQrCode}
            type="button"
          >
            Télécharger le QR code (SVG)
          </button>
        </div>
      ) : null}
    </>
  );
}
