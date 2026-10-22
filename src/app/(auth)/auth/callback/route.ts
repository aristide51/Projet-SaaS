import { NextResponse, type NextRequest } from "next/server";
import { getSafeRedirectPath } from "@/lib/auth/redirect";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const next = getSafeRedirectPath(request.nextUrl.searchParams.get("next"));

  if (!code) {
    return NextResponse.redirect(
      new URL("/auth/login?error=callback", request.url),
    );
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(
      new URL("/auth/login?error=callback", request.url),
    );
  }

  const { data, error: userError } = await supabase.auth.getUser();

  if (userError || !data.user?.email_confirmed_at) {
    await supabase.auth.signOut({ scope: "local" });
    return NextResponse.redirect(new URL("/auth/verify-email", request.url));
  }

  return NextResponse.redirect(new URL(next, request.url));
}
