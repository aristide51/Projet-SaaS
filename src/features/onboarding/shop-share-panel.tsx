"use client";

import Link from "next/link";
import { useState, useSyncExternalStore } from "react";
import { QRCodeSVG } from "qrcode.react";

const subscribeToLocation = () => () => {};
const getLocationOrigin = () => window.location.origin;
const getServerLocationOrigin = () => "";

export function ShopSharePanel({
  shopName,
  slug,
}: {
  shopName: string;
  slug: string;
}) {
  const origin = useSyncExternalStore(
    subscribeToLocation,
    getLocationOrigin,
    getServerLocationOrigin,
  );
  const [copyMessage, setCopyMessage] = useState("");
  const shopPath = `/${encodeURIComponent(slug)}`;
  const shopUrl = origin ? new URL(shopPath, origin).toString() : "";
  const shareMessage = shopUrl
    ? `Découvre ${shopName} sur sa boutique en ligne : ${shopUrl}`
    : "";

  async function copyLink() {
    if (!shopUrl) return;
    try {
      await navigator.clipboard.writeText(shopUrl);
      setCopyMessage("Lien copié.");
    } catch {
      setCopyMessage("La copie a échoué. Sélectionne le lien pour le copier.");
    }
  }

  return (
    <div className="onboarding-share">
      <p>Partage le lien de ta vitrine avec tes clients.</p>
      <p className="onboarding-share__link">
        {shopUrl ? (
          <Link href={shopPath}>{shopUrl}</Link>
        ) : (
          "Préparation du lien…"
        )}
      </p>
      {shopUrl ? (
        <div className="onboarding-share__actions">
          <button
            className="ui-button ui-button--secondary"
            onClick={() => void copyLink()}
            type="button"
          >
            Copier le lien
          </button>
          <a
            className="ui-button ui-button--primary"
            href={`https://wa.me/?text=${encodeURIComponent(shareMessage)}`}
            rel="noreferrer"
            target="_blank"
          >
            Partager sur WhatsApp
          </a>
        </div>
      ) : null}
      {copyMessage ? <p role="status">{copyMessage}</p> : null}
      {shopUrl ? (
        <div className="onboarding-share__qr">
          <QRCodeSVG
            bgColor="var(--color-surface)"
            fgColor="var(--color-ink)"
            includeMargin
            level="M"
            size={192}
            title={`QR code de ${shopName}`}
            value={shopUrl}
          />
          <p>Scanne ce QR code pour ouvrir ta vitrine.</p>
        </div>
      ) : null}
    </div>
  );
}
