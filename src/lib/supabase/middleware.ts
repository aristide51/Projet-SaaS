import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { validateServerEnv } from "@/lib/env";
import { getProtectedArea, getSafeRedirectPath } from "@/lib/auth/redirect";
import { getRequestOrigin } from "@/lib/security/origin";
import type { Database } from "@/types/database";

export async function updateSession(
  request: NextRequest,
  requestHeaders: Headers = request.headers,
) {
  const { NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY } =
    validateServerEnv();
  const secure = NEXT_PUBLIC_SUPABASE_URL.startsWith("https://");
  let response = NextResponse.next({ request: { headers: requestHeaders } });

  const supabase = createServerClient<Database>(
    NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookieOptions: {
        httpOnly: true,
        path: "/",
        sameSite: "lax",
        secure,
      },
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => {
            request.cookies.set(name, value);
          });

          requestHeaders.set("cookie", request.cookies.toString());
          response = NextResponse.next({
            request: { headers: requestHeaders },
          });

          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, {
              ...options,
              httpOnly: true,
              path: "/",
              sameSite: "lax",
              secure,
            });
          });
        },
      },
    },
  );

  const { error } = await supabase.auth.getClaims();
  let hasInvalidRefreshToken = false;

  if (error) {
    if (!isInvalidRefreshTokenError(error)) {
      throw new Error("Impossible de vérifier la session Supabase.", {
        cause: error,
      });
    }

    hasInvalidRefreshToken = true;
    const invalidCookieNames = request.cookies
      .getAll()
      .map(({ name }) => name)
      .filter((name) => /^sb-.+-auth-token(?:\.\d+)?$/.test(name));

    invalidCookieNames.forEach((name) => request.cookies.delete(name));
    requestHeaders.set("cookie", request.cookies.toString());

    const responseWithAnonymousRequest = NextResponse.next({
      request: { headers: requestHeaders },
    });
    response.cookies.getAll().forEach((cookie) => {
      responseWithAnonymousRequest.cookies.set(cookie);
    });
    response = responseWithAnonymousRequest;

    invalidCookieNames.forEach((name) => {
      response.cookies.set(name, "", {
        expires: new Date(0),
        httpOnly: true,
        maxAge: 0,
        path: "/",
        sameSite: "lax",
        secure,
      });
    });
  }

  const protectedArea = getProtectedArea(request.nextUrl.pathname);

  if (!protectedArea) {
    return response;
  }

  const {
    data: { user },
    error: userError,
  } = hasInvalidRefreshToken
    ? { data: { user: null }, error: null }
    : await supabase.auth.getUser();

  if (userError && userError.name !== "AuthSessionMissingError") {
    throw new Error("Impossible de vérifier la session protégée.", {
      cause: userError,
    });
  }

  if (!user || !user.email_confirmed_at) {
    const redirectUrl = new URL("/auth/login", request.url);
    redirectUrl.searchParams.set(
      "next",
      getSafeRedirectPath(
        `${request.nextUrl.pathname}${request.nextUrl.search}`,
      ),
    );
    return redirectWithCookies(redirectUrl, response, request);
  }

  if (protectedArea === "admin") {
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("role_global")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError) {
      throw new Error("Impossible de vérifier le rôle administrateur.", {
        cause: profileError,
      });
    }

    if (profile?.role_global !== "admin") {
      return redirectWithCookies(
        new URL("/account?error=access-denied", request.url),
        response,
        request,
      );
    }
  }

  return response;
}

function isInvalidRefreshTokenError(error: { code?: string | undefined }) {
  return (
    error.code === "refresh_token_not_found" ||
    error.code === "refresh_token_already_used" ||
    error.code === "session_expired"
  );
}

function redirectWithCookies(
  url: URL,
  response: NextResponse,
  request: NextRequest,
) {
  const origin = getRequestOrigin(request) ?? url.origin;
  const redirectResponse = NextResponse.redirect(
    new URL(`${url.pathname}${url.search}${url.hash}`, origin),
  );

  response.cookies.getAll().forEach((cookie) => {
    redirectResponse.cookies.set(cookie);
  });

  return redirectResponse;
}
