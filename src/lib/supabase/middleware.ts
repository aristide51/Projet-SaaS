import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { validateServerEnv } from "@/lib/env";
import { getProtectedArea, getSafeRedirectPath } from "@/lib/auth/redirect";
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

  if (error) {
    throw new Error("Impossible de vérifier la session Supabase.", {
      cause: error,
    });
  }

  const protectedArea = getProtectedArea(request.nextUrl.pathname);

  if (!protectedArea) {
    return response;
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

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
    return redirectWithCookies(redirectUrl, response);
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
      );
    }
  }

  return response;
}

function redirectWithCookies(url: URL, response: NextResponse) {
  const redirectResponse = NextResponse.redirect(url);

  response.cookies.getAll().forEach((cookie) => {
    redirectResponse.cookies.set(cookie);
  });

  return redirectResponse;
}
