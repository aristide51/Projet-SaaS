import { headers } from "next/headers";
import { getSafeRedirectPath } from "@/lib/auth/redirect";
import { AuthForm, type AuthMode } from "./auth-form";
import { AuthLayout } from "@/components/design/auth-layout";

export async function AuthPage({
  mode,
  next,
}: {
  mode: AuthMode;
  next?: string;
}) {
  const requestHeaders = await headers();
  const safeNext = getSafeRedirectPath(next);

  return (
    <AuthLayout
      rightContent={
        <AuthForm
          mode={mode}
          next={safeNext}
          nonce={requestHeaders.get("x-nonce") ?? ""}
          siteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? ""}
        />
      }
    />
  );
}
