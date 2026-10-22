import { AuthPage } from "@/features/auth/auth-page";
import { getSafeRedirectPath } from "@/lib/auth/redirect";

export default async function MagicLinkPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  return <AuthPage mode="magic" next={getSafeRedirectPath(next)} />;
}
