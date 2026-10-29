import { NextResponse, type NextRequest } from "next/server";
import { getSecurityHeaders } from "@/lib/security/headers";
import { isSameOriginWrite } from "@/lib/security/origin";
import { shouldMarkPublicPwaResponse } from "@/lib/pwa/cache-policy";
import { hasSupabaseConfig } from "@/lib/env";
import { updateSession } from "@/lib/supabase/middleware";

export async function proxy(request: NextRequest) {
  const { contentSecurityPolicy, nonce, responseHeaders } =
    getSecurityHeaders();
  const effectiveContentSecurityPolicy =
    request.nextUrl.pathname === "/offline.html"
      ? contentSecurityPolicy.replace("'strict-dynamic' ", "")
      : contentSecurityPolicy;
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set(
    "x-current-path",
    `${request.nextUrl.pathname}${request.nextUrl.search}`,
  );
  requestHeaders.set("Content-Security-Policy", effectiveContentSecurityPolicy);
  responseHeaders.set(
    "Content-Security-Policy",
    effectiveContentSecurityPolicy,
  );

  const isStaticHomePreview =
    process.env.NODE_ENV === "development" &&
    !hasSupabaseConfig() &&
    request.nextUrl.pathname === "/" &&
    (request.method === "GET" || request.method === "HEAD");

  const response = isStaticHomePreview
    ? NextResponse.next({ request: { headers: requestHeaders } })
    : isSameOriginWrite(request)
      ? await updateSession(request, requestHeaders)
      : NextResponse.json({ error: "Origine non autorisée." }, { status: 403 });

  responseHeaders.forEach((value, name) => response.headers.set(name, value));
  if (
    shouldMarkPublicPwaResponse(
      request.method,
      request.nextUrl.pathname,
      request.headers.get("cookie"),
    )
  ) {
    response.headers.set("X-PWA-Cacheable", "public");
  }
  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
