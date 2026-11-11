import type { Metadata } from "next";
import Script from "next/script";
import { headers } from "next/headers";
import "@fontsource-variable/inter";
import "@fontsource-variable/unbounded";
import "@/components/design/auth-layout.css";
import "./globals.css";
import "@/components/design/site-theme.css";
import { getSiteUrl } from "@/lib/site-url";
import { DeviceCompatibilityGate } from "@/components/design/device-compatibility-gate";

export const metadata: Metadata = {
  metadataBase: getSiteUrl(),
  title: "Boutiques locales",
  description:
    "Une plateforme simple pour les commerces locaux du Burkina Faso.",
  robots: { index: false, follow: false },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const requestHeaders = await headers();

  return (
    <html lang="fr">
      <body>
        {process.env.NODE_ENV === "development" ? (
          <Script
            nonce={requestHeaders.get("x-nonce") ?? undefined}
            src="/pwa-dev-cleanup.js"
            strategy="afterInteractive"
          />
        ) : null}
        <DeviceCompatibilityGate>{children}</DeviceCompatibilityGate>
        <Script
          nonce={requestHeaders.get("x-nonce") ?? undefined}
          src="/pwa-offline.js"
          strategy="beforeInteractive"
        />
      </body>
    </html>
  );
}
