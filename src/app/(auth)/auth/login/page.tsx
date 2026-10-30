import type { Metadata } from "next";
import { AuthPage } from "@/features/auth/auth-page";
import { getSafeRedirectPath } from "@/lib/auth/redirect";

export const metadata: Metadata = {
  title: "Connexion | Faso Studio",
  description: "Connecte-toi à ton espace Faso Studio.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  return <AuthPage mode="login" next={getSafeRedirectPath(next)} />;
}
