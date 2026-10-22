const FALLBACK_REDIRECT = "/account";
const APP_ORIGIN = "https://application.invalid";

export function getSafeRedirectPath(value: string | null | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return FALLBACK_REDIRECT;
  }

  try {
    const target = new URL(value, APP_ORIGIN);

    if (target.origin !== APP_ORIGIN || target.pathname.startsWith("/auth/")) {
      return FALLBACK_REDIRECT;
    }

    return `${target.pathname}${target.search}${target.hash}`;
  } catch {
    return FALLBACK_REDIRECT;
  }
}

export function getProtectedArea(pathname: string) {
  if (pathname === "/admin" || pathname.startsWith("/admin/")) {
    return "admin" as const;
  }

  if (pathname === "/dashboard" || pathname.startsWith("/dashboard/")) {
    return "authenticated" as const;
  }

  if (pathname === "/account" || pathname.startsWith("/account/")) {
    return "authenticated" as const;
  }

  return null;
}
