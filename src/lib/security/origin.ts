import type { NextRequest } from "next/server";

const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export function getRequestOrigin(
  request: Pick<NextRequest, "url" | "headers">,
) {
  try {
    const requestUrl = new URL(request.url);
    const forwardedHost = request.headers
      .get("x-forwarded-host")
      ?.split(",")[0]
      ?.trim();
    const host = forwardedHost ?? request.headers.get("host");
    const forwardedProtocol = request.headers
      .get("x-forwarded-proto")
      ?.split(",")[0]
      ?.trim()
      .replace(/:$/, "");
    const protocol = forwardedProtocol ?? requestUrl.protocol.replace(/:$/, "");

    if (!host || !["http", "https"].includes(protocol)) {
      return undefined;
    }

    return new URL(`${protocol}://${host}`).origin;
  } catch {
    return undefined;
  }
}

export function isSameOriginWrite(
  request: Pick<NextRequest, "method" | "url" | "headers">,
) {
  if (!WRITE_METHODS.has(request.method.toUpperCase())) {
    return true;
  }

  const origin = request.headers.get("origin");

  if (!origin) {
    return false;
  }

  try {
    const requestOrigin = getRequestOrigin(request);
    return Boolean(requestOrigin && new URL(origin).origin === requestOrigin);
  } catch {
    return false;
  }
}
