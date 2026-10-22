import type { Metadata } from "next";
import localFont from "next/font/local";
import { headers } from "next/headers";
import "./globals.css";

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
  title: "Boutiques locales",
  description:
    "Une plateforme simple pour les commerces locaux du Burkina Faso.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  await headers();

  return (
    <html className={`${manrope.variable} ${dmSans.variable}`} lang="fr">
      <body>{children}</body>
    </html>
  );
}
