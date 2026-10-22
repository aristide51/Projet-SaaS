import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DesignSystemPage } from "@/components/design/design-system-page";

export const metadata: Metadata = {
  title: "Système de design — Faso Studio",
  description:
    "Fondations visuelles et composants accessibles pour la plateforme Faso.",
};

export default function DesignPage() {
  // The component gallery is a development tool, not a public route.
  if (process.env.NODE_ENV !== "development") {
    notFound();
  }

  return <DesignSystemPage />;
}
