type EdgePolicyName =
  | "order_creation"
  | "payment_declaration"
  | "booking"
  | "review"
  | "login"
  | "invitation"
  | "review_decision"
  | "payment_webhook"
  | "payment_reconciliation"
  | "notification"
  | "unsubscribe"
  | "booking_cancel"
  | "invoice_receipt";

type EdgePolicy = {
  ipLimit: number;
  userLimit: number | null;
  windowSeconds: number;
  maxBodyBytes: number;
};

export const edgeRateLimitPolicies: Record<EdgePolicyName, EdgePolicy> = {
  order_creation: {
    ipLimit: 20,
    userLimit: 5,
    windowSeconds: 60,
    maxBodyBytes: 16_384,
  },
  payment_declaration: {
    ipLimit: 10,
    userLimit: 3,
    windowSeconds: 600,
    maxBodyBytes: 8_192,
  },
  booking: {
    ipLimit: 20,
    userLimit: 5,
    windowSeconds: 60,
    maxBodyBytes: 8_192,
  },
  review: {
    ipLimit: 10,
    userLimit: 3,
    windowSeconds: 3_600,
    maxBodyBytes: 16_384,
  },
  login: {
    ipLimit: 10,
    userLimit: 5,
    windowSeconds: 900,
    maxBodyBytes: 8_192,
  },
  invitation: {
    ipLimit: 20,
    userLimit: 5,
    windowSeconds: 3_600,
    maxBodyBytes: 8_192,
  },
  review_decision: {
    ipLimit: 20,
    userLimit: 5,
    windowSeconds: 3_600,
    maxBodyBytes: 8_192,
  },
  payment_webhook: {
    ipLimit: 120,
    userLimit: null,
    windowSeconds: 60,
    maxBodyBytes: 16_384,
  },
  payment_reconciliation: {
    ipLimit: 10,
    userLimit: null,
    windowSeconds: 60,
    maxBodyBytes: 4_096,
  },
  notification: {
    ipLimit: 60,
    userLimit: null,
    windowSeconds: 60,
    maxBodyBytes: 8_192,
  },
  unsubscribe: {
    ipLimit: 10,
    userLimit: null,
    windowSeconds: 3_600,
    maxBodyBytes: 4_096,
  },
  booking_cancel: {
    ipLimit: 10,
    userLimit: null,
    windowSeconds: 3_600,
    maxBodyBytes: 4_096,
  },
  invoice_receipt: {
    ipLimit: 10,
    userLimit: 5,
    windowSeconds: 300,
    maxBodyBytes: 1_024,
  },
};

const allowedRequestHeaders =
  "authorization, apikey, content-type, x-client-info, x-notify-secret, x-payment-cron-secret, x-provider-signature";
const allowedMethods = "GET, POST, OPTIONS";
const genericErrorMessages: Record<string, string> = {
  BAD_REQUEST: "La demande est invalide.",
  FORBIDDEN: "Accès non autorisé.",
  INTERNAL_ERROR: "Une erreur est survenue.",
  METHOD_NOT_ALLOWED: "Méthode non autorisée.",
  RATE_LIMITED: "Trop de requêtes. Réessaie plus tard.",
  SERVICE_UNAVAILABLE: "Service temporairement indisponible.",
  UNAUTHORIZED: "Connexion requise.",
  UNSUPPORTED_MEDIA_TYPE: "Format de demande non pris en charge.",
};

export type EdgeContext = {
  request: Request;
  body: Uint8Array;
  headers: Headers;
  errorResponse: (
    status: number,
    code: string,
    retryAfter?: number,
  ) => Response;
  limitUser: (userId: string) => Promise<Response | null>;
};

type ProtectionOptions = {
  policy: EdgePolicyName | ((request: Request) => EdgePolicyName);
  requireOrigin?: boolean;
};

type RateLimitResult = {
  allowed: boolean;
  retry_after: number;
};

export function edgeErrorResponse(
  status: number,
  code: string,
  headers?: HeadersInit,
  retryAfter?: number,
  message?: string,
) {
  const responseHeaders = new Headers(headers);
  responseHeaders.set("Content-Type", "application/json");
  if (retryAfter !== undefined) {
    responseHeaders.set("Retry-After", String(retryAfter));
  }
  return new Response(
    JSON.stringify({
      error: {
        code,
        message:
          message ??
          genericErrorMessages[code] ??
          genericErrorMessages.INTERNAL_ERROR,
      },
    }),
    { status, headers: responseHeaders },
  );
}

export function jsonErrorResponse(
  context: Pick<EdgeContext, "headers" | "errorResponse">,
  status: number,
  code: string,
  retryAfter?: number,
) {
  return context.errorResponse(status, code, retryAfter);
}

export async function withEdgeProtection(
  request: Request,
  options: ProtectionOptions,
  handler: (context: EdgeContext) => Promise<Response>,
): Promise<Response> {
  const origin = request.headers.get("origin");
  const allowedOrigins = getAllowedOrigins();
  if (
    !allowedOrigins ||
    (origin !== null && !allowedOrigins.has(origin)) ||
    (options.requireOrigin === true && origin === null)
  ) {
    return edgeErrorResponse(
      allowedOrigins ? 403 : 503,
      allowedOrigins ? "FORBIDDEN" : "SERVICE_UNAVAILABLE",
    );
  }

  const responseHeaders = new Headers();
  responseHeaders.set("Vary", "Origin");
  responseHeaders.set("Access-Control-Allow-Headers", allowedRequestHeaders);
  responseHeaders.set("Access-Control-Allow-Methods", allowedMethods);
  if (origin) responseHeaders.set("Access-Control-Allow-Origin", origin);
  const errorResponse = (status: number, code: string, retryAfter?: number) =>
    edgeErrorResponse(status, code, responseHeaders, retryAfter);

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: responseHeaders });
  }
  if (request.method !== "GET" && request.method !== "POST") {
    return errorResponse(405, "METHOD_NOT_ALLOWED");
  }

  const policyName =
    typeof options.policy === "function"
      ? options.policy(request)
      : options.policy;
  const policy = edgeRateLimitPolicies[policyName];
  const contentLength = request.headers.get("content-length");
  if (contentLength !== null && !/^\d+$/.test(contentLength)) {
    return errorResponse(400, "BAD_REQUEST");
  }
  if (Number(contentLength ?? 0) > policy.maxBodyBytes) {
    return errorResponse(413, "BAD_REQUEST");
  }
  const contentType = request.headers
    .get("content-type")
    ?.split(";", 1)[0]
    .trim()
    .toLowerCase();
  if (
    request.method === "POST" &&
    contentType !== "application/json" &&
    !(
      (policyName === "unsubscribe" || policyName === "booking_cancel") &&
      contentType === "application/x-www-form-urlencoded"
    )
  ) {
    return errorResponse(415, "UNSUPPORTED_MEDIA_TYPE");
  }

  let body: Uint8Array;
  try {
    body = await readBoundedBody(request, policy.maxBodyBytes);
  } catch {
    return errorResponse(413, "BAD_REQUEST");
  }

  try {
    const ipResponse = await consumeRateLimit(
      policyName,
      "ip",
      getClientIp(request),
      policy.ipLimit,
      policy.windowSeconds,
      responseHeaders,
    );
    if (ipResponse) return ipResponse;

    const response = await handler({
      request,
      body,
      headers: responseHeaders,
      errorResponse,
      limitUser: async (userId) => {
        if (policy.userLimit === null) return null;
        return consumeRateLimit(
          policyName,
          "user",
          userId,
          policy.userLimit,
          policy.windowSeconds,
          responseHeaders,
        );
      },
    });
    return attachEdgeHeaders(response, responseHeaders);
  } catch {
    return errorResponse(500, "INTERNAL_ERROR");
  }
}

export function attachEdgeHeaders(response: Response, headers: Headers) {
  const mergedHeaders = new Headers(response.headers);
  for (const [name, value] of headers) mergedHeaders.set(name, value);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: mergedHeaders,
  });
}

export function decodeJsonBody(body: Uint8Array): unknown {
  return JSON.parse(new TextDecoder().decode(body));
}

export async function decodeFormBody(context: EdgeContext): Promise<FormData> {
  return new Request(context.request.url, {
    method: "POST",
    headers: context.request.headers,
    body: new TextDecoder().decode(context.body),
  }).formData();
}

function getAllowedOrigins() {
  const value = Deno.env.get("EDGE_ALLOWED_ORIGINS");
  if (!value) return null;
  const origins = value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  if (origins.length === 0) return null;
  const normalized = new Set<string>();
  for (const entry of origins) {
    try {
      const url = new URL(entry);
      if (
        (url.protocol !== "https:" &&
          url.hostname !== "localhost" &&
          url.hostname !== "127.0.0.1") ||
        url.origin !== entry
      ) {
        return null;
      }
      normalized.add(url.origin);
    } catch {
      return null;
    }
  }
  return normalized;
}

function getClientIp(request: Request) {
  const cloudflareIp = request.headers.get("cf-connecting-ip")?.trim();
  if (cloudflareIp) return cloudflareIp;
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    const forwardedIps = forwardedFor.split(",").map((ip) => ip.trim());
    return forwardedIps[forwardedIps.length - 1] || "unknown";
  }
  return "unknown";
}

async function readBoundedBody(request: Request, maxBytes: number) {
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new Error("Request body is too large.");
    }
    chunks.push(value);
  }
  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

async function consumeRateLimit(
  policy: EdgePolicyName,
  subjectType: "ip" | "user",
  subject: string,
  limit: number,
  windowSeconds: number,
  headers: Headers,
) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    return edgeErrorResponse(503, "SERVICE_UNAVAILABLE", headers);
  }

  const subjectHash = await hmacHex(
    serviceRoleKey,
    `${policy}:${subjectType}:${subject}`,
  );
  let response: Response;
  try {
    response = await fetch(
      `${supabaseUrl.replace(/\/+$/, "")}/rest/v1/rpc/consume_edge_rate_limit`,
      {
        method: "POST",
        headers: {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          p_policy: `${policy}:${subjectType}`,
          p_subject_hash: subjectHash,
          p_limit: limit,
          p_window_seconds: windowSeconds,
        }),
        signal: AbortSignal.timeout(3_000),
      },
    );
  } catch {
    return edgeErrorResponse(503, "SERVICE_UNAVAILABLE", headers);
  }
  if (!response.ok) {
    await response.body?.cancel();
    return edgeErrorResponse(503, "SERVICE_UNAVAILABLE", headers);
  }

  let result: RateLimitResult | RateLimitResult[];
  try {
    result = await response.json();
  } catch {
    return edgeErrorResponse(503, "SERVICE_UNAVAILABLE", headers);
  }
  const limitResult = Array.isArray(result) ? result[0] : result;
  if (
    !limitResult ||
    typeof limitResult.allowed !== "boolean" ||
    !Number.isInteger(limitResult.retry_after)
  ) {
    return edgeErrorResponse(503, "SERVICE_UNAVAILABLE", headers);
  }
  if (!limitResult.allowed) {
    return edgeErrorResponse(
      429,
      "RATE_LIMITED",
      headers,
      Math.max(1, limitResult.retry_after),
    );
  }
  return null;
}

async function hmacHex(secret: string, value: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(signature), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}
