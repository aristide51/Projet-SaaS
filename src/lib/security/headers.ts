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

export function getSecurityHeaders() {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const isProduction = process.env.NODE_ENV === "production";
  const supabaseOrigin = getOrigin(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const sentryOrigin = getOrigin(process.env.NEXT_PUBLIC_SENTRY_DSN);
  const connectSources = [
    "'self'",
    supabaseOrigin,
    supabaseOrigin?.replace(/^https:/, "wss:").replace(/^http:/, "ws:"),
    sentryOrigin,
    "https://challenges.cloudflare.com",
  ]
    .filter(Boolean)
    .join(" ");

  const contentSecurityPolicy = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' https://challenges.cloudflare.com${isProduction ? "" : " 'unsafe-eval'"}`,
    `style-src 'self' 'nonce-${nonce}'`,
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
