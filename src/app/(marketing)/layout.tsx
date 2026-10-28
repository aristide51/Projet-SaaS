import type { Metadata } from "next";
import { PwaStatus } from "@/features/pwa/pwa-status";
import { getSiteUrl } from "@/lib/site-url";

export const metadata: Metadata = {
  metadataBase: getSiteUrl(),
  title: "Boutiques locales — Plateforme pour commerces du Burkina Faso",
  description:
    "Créez votre boutique en ligne, gérez votre catalogue, vos rendez-vous et encaissez par mobile money. Simple, rapide, pensé pour les commerces locaux.",
  robots: { index: true, follow: true },
};

export default async function MarketingLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <>
      <PwaStatus />
      {children}
    </>
  );
}
