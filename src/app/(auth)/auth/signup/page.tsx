import { AuthPage } from "@/features/auth/auth-page";
import { getSafeRedirectPath } from "@/lib/auth/redirect";

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  return <AuthPage mode="signup" next={getSafeRedirectPath(next)} />;
}
