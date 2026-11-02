import type { Metadata } from "next";
import { AuthPage } from "@/features/auth/auth-page";
import { getSafeRedirectPath } from "@/lib/auth/redirect";

export const metadata: Metadata = {
  title: "Connexion | Faso Studio",
  description:
    "Connecte-toi à Faso Studio pour retrouver ta boutique, tes commandes et tes rendez-vous.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  return <AuthPage mode="login" next={getSafeRedirectPath(next)} />;
}
