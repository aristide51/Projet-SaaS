function getOrigin(value: string | undefined) {
  if (!value) {
    return undefined;
  }

  try {
    return new URL(value).origin;
  } catch {
    return undefined;
  }
}

function getPublicHttpsOrigin(value: string | undefined) {
  const origin = getOrigin(value);
  return origin?.startsWith("https://") ? origin : undefined;
}

export function getSecurityHeaders() {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const isProduction = process.env.NODE_ENV === "production";
  const supabaseOrigin = getOrigin(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const sentryOrigin = getOrigin(process.env.NEXT_PUBLIC_SENTRY_DSN);
  const riveOrigin = getPublicHttpsOrigin(
    process.env.NEXT_PUBLIC_RIVE_HERO_SCENE,
  );
  const splineOrigin = getPublicHttpsOrigin(
    process.env.NEXT_PUBLIC_SPLINE_HERO_SCENE,
  );
  const connectSources = [
    "'self'",
    supabaseOrigin,
    supabaseOrigin?.replace(/^https:/, "wss:").replace(/^http:/, "ws:"),
    sentryOrigin,
    riveOrigin,
    splineOrigin,
    "https://challenges.cloudflare.com",
  ]
    .filter(Boolean)
    .join(" ");

  const contentSecurityPolicy = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' https://challenges.cloudflare.com${process.env.NEXT_PUBLIC_RIVE_HERO_SCENE ? " 'wasm-unsafe-eval'" : ""}${isProduction ? "" : " 'unsafe-eval'"}`,
    `style-src 'self' 'nonce-${nonce}'`,
    "style-src-attr 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self'",
    `connect-src ${connectSources}`,
    "frame-src https://challenges.cloudflare.com",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    `form-action 'self' ${supabaseOrigin ?? ""}`.trim(),
    "frame-ancestors 'none'",
    ...(isProduction ? ["upgrade-insecure-requests"] : []),
  ].join("; ");

  const responseHeaders = new Headers({
    "Content-Security-Policy": contentSecurityPolicy,
    "Permissions-Policy":
      "camera=(), geolocation=(), microphone=(), payment=()",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
  });

  if (isProduction) {
    responseHeaders.set(
      "Strict-Transport-Security",
      "max-age=63072000; includeSubDomains",
    );
  }

  return { contentSecurityPolicy, nonce, responseHeaders };
}
