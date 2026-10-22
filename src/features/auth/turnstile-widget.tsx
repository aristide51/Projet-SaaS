"use client";

import Script from "next/script";
import { useEffect, useRef, useState } from "react";

type TurnstileOptions = {
  sitekey: string;
  callback: (token: string) => void;
  "expired-callback": () => void;
  "error-callback": () => void;
  theme: "auto";
};

type TurnstileApi = {
  render: (container: HTMLElement, options: TurnstileOptions) => string;
  remove: (widgetId: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

type TurnstileWidgetProps = {
  siteKey: string;
  nonce: string;
  widgetKey: number;
  onToken: (token: string) => void;
  onError: (message: string) => void;
};

export function TurnstileWidget({
  siteKey,
  nonce,
  widgetKey,
  onToken,
  onError,
}: TurnstileWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scriptReady, setScriptReady] = useState(false);

  useEffect(() => {
    if (!scriptReady || !containerRef.current || !window.turnstile) {
      return;
    }

    const widgetId = window.turnstile.render(containerRef.current, {
      sitekey: siteKey,
      callback: onToken,
      "expired-callback": () => onToken(""),
      "error-callback": () =>
        onError("La vérification anti-robot a échoué. Réessaie."),
      theme: "auto",
    });

    return () => {
      window.turnstile?.remove(widgetId);
    };
  }, [onError, onToken, scriptReady, siteKey, widgetKey]);

  if (!siteKey) {
    return (
      <p className="auth-form__notice" role="status">
        La vérification anti-robot n’est pas configurée.
      </p>
    );
  }

  return (
    <div className="auth-turnstile">
      <Script
        nonce={nonce}
        onError={() =>
          onError("Le contrôle anti-robot ne peut pas être chargé.")
        }
        onReady={() => setScriptReady(true)}
        src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
        strategy="afterInteractive"
      />
      <div ref={containerRef} />
    </div>
  );
}
