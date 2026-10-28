import type { Metadata } from "next";
import Script from "next/script";
import localFont from "next/font/local";
import { headers } from "next/headers";
import "./globals.css";
import { getSiteUrl } from "@/lib/site-url";

const manrope = localFont({
  src: "./fonts/manrope-latin-variable.woff2",
  variable: "--font-manrope",
  weight: "200 800",
  display: "swap",
});

const dmSans = localFont({
  src: "./fonts/dm-sans-latin-variable.woff2",
  variable: "--font-dm-sans",
  weight: "100 1000",
  display: "swap",
});

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
    <html className={`${manrope.variable} ${dmSans.variable}`} lang="fr">
      <body>
        {children}
        <Script
          nonce={requestHeaders.get("x-nonce") ?? undefined}
          src="/pwa-offline.js"
          strategy="beforeInteractive"
        />
      </body>
    </html>
  );
}
