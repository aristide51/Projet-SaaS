import type { NextRequest } from "next/server";

const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

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
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}
