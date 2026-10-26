import type { Metadata } from "next";
import localFont from "next/font/local";

const manrope = localFont({
  src: "../fonts/manrope-latin-variable.woff2",
  variable: "--font-manrope",
  weight: "200 800",
  display: "swap",
});

const dmSans = localFont({
  src: "../fonts/dm-sans-latin-variable.woff2",
  variable: "--font-dm-sans",
  weight: "100 1000",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Boutiques locales — Plateforme pour commerces du Burkina Faso",
  description:
    "Créez votre boutique en ligne, gérez votre catalogue, vos rendez-vous et encaissez par mobile money. Simple, rapide, pensé pour les commerces locaux.",
};

export default async function MarketingLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html className={`${manrope.variable} ${dmSans.variable}`} lang="fr">
      <body>{children}</body>
    </html>
  );
}
