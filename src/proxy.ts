import { NextResponse, type NextRequest } from "next/server";
import { getSecurityHeaders } from "@/lib/security/headers";
import { isSameOriginWrite } from "@/lib/security/origin";
import { updateSession } from "@/lib/supabase/middleware";

export async function proxy(request: NextRequest) {
  const { contentSecurityPolicy, nonce, responseHeaders } =
    getSecurityHeaders();
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set(
    "x-current-path",
    `${request.nextUrl.pathname}${request.nextUrl.search}`,
  );
  requestHeaders.set("Content-Security-Policy", contentSecurityPolicy);

  const response = isSameOriginWrite(request)
    ? await updateSession(request, requestHeaders)
    : NextResponse.json({ error: "Origine non autorisée." }, { status: 403 });

  responseHeaders.forEach((value, name) => response.headers.set(name, value));
  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
