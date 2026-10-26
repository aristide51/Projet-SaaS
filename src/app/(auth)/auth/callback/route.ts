import { NextResponse, type NextRequest } from "next/server";
import { getSafeRedirectPath } from "@/lib/auth/redirect";
import { getRequestOrigin } from "@/lib/security/origin";
import { consumeReauthPending, setReauthProof } from "@/lib/security/reauth";
import { createClient } from "@/lib/supabase/server";
import { mergeGuestCartCookieIntoAccount } from "@/features/cart/data";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const next = getSafeRedirectPath(request.nextUrl.searchParams.get("next"));

  if (!code) {
    return redirectToPath("/auth/login?error=callback", request);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return redirectToPath("/auth/login?error=callback", request);
  }

  const { data, error: userError } = await supabase.auth.getUser();

  if (userError || !data.user?.email_confirmed_at) {
    await supabase.auth.signOut({ scope: "local" });
    return redirectToPath("/auth/verify-email", request);
  }

  if (
    request.nextUrl.searchParams.get("reauth") === "1" &&
    (await consumeReauthPending())
  ) {
    await setReauthProof(data.user.id);
  }

  await mergeGuestCartCookieIntoAccount();

  return redirectToPath(next, request);
}

function redirectToPath(path: string, request: NextRequest) {
  const origin = getRequestOrigin(request) ?? request.url;
  return NextResponse.redirect(new URL(path, origin));
}
