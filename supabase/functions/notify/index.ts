import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildOrderEmail, sendOrderEmail } from "../_shared/order-email.ts";

const corsHeaders = {
  "Access-Control-Allow-Headers": "content-type, x-notify-secret",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Origin": "*",
  "Content-Type": "application/json",
};
const maxEmailsPerUserPerHour = 10;
const maxBatchSize = 20;
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function response(status: number, message: string) {
  return new Response(JSON.stringify({ message }), {
    status,
    headers: corsHeaders,
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function constantTimeEqual(left: string, right: string) {
  const length = Math.max(left.length, right.length);
  let difference = left.length ^ right.length;
  for (let index = 0; index < length; index += 1) {
    difference |=
      (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }
  return difference === 0;
}

function base64UrlEncode(value: Uint8Array) {
  return btoa(String.fromCharCode(...value))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}

function base64UrlDecode(value: string) {
  const base64 = value.replaceAll("-", "+").replaceAll("_", "/");
  return Uint8Array.from(
    atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "=")),
    (character) => character.charCodeAt(0),
  );
}

async function signUnsubscribeToken(userId: string, secret: string) {
  const payload = `${userId}.${Math.floor(Date.now() / 1000) + 90 * 86400}`;
  const encodedPayload = base64UrlEncode(new TextEncoder().encode(payload));
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
    new TextEncoder().encode(encodedPayload),
  );
  return `${encodedPayload}.${base64UrlEncode(new Uint8Array(signature))}`;
}

async function verifyUnsubscribeToken(token: string, secret: string) {
  const [encodedPayload, encodedSignature, extra] = token.split(".");
  if (!encodedPayload || !encodedSignature || extra) return null;
  try {
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"],
    );
    const valid = await crypto.subtle.verify(
      "HMAC",
      key,
      base64UrlDecode(encodedSignature),
      new TextEncoder().encode(encodedPayload),
    );
    if (!valid) return null;
    const payload = new TextDecoder().decode(base64UrlDecode(encodedPayload));
    const [userId, expiresAt, payloadExtra] = payload.split(".");
    if (
      !userId ||
      !uuidPattern.test(userId) ||
      payloadExtra ||
      !expiresAt ||
      Number(expiresAt) <= Math.floor(Date.now() / 1000)
    ) {
      return null;
    }
    return userId;
  } catch {
    return null;
  }
}

function htmlResponse(status: number, html: string) {
  return new Response(html, {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "text/html; charset=utf-8",
    },
  });
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entities[character] ?? character;
  });
}

async function handleUnsubscribe(
  request: Request,
  admin: ReturnType<typeof createClient>,
  unsubscribeSecret: string,
) {
  const url = new URL(request.url);
  const token =
    request.method === "GET"
      ? url.searchParams.get("token")
      : (await request.formData()).get("token");
  if (typeof token !== "string") {
    return htmlResponse(400, "<h1>Lien de désinscription invalide.</h1>");
  }

  const userId = await verifyUnsubscribeToken(token, unsubscribeSecret);
  if (!userId) {
    return htmlResponse(400, "<h1>Ce lien de désinscription a expiré.</h1>");
  }

  if (request.method === "GET") {
    const actionUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/notify?action=unsubscribe`;
    return htmlResponse(
      200,
      `<main><h1>Gérer les e-mails non essentiels</h1><p>Les e-mails indispensables au suivi des commandes continueront d’être envoyés.</p><form method="post" action="${escapeHtml(actionUrl)}"><input type="hidden" name="token" value="${escapeHtml(token)}"><button type="submit">Me désinscrire des e-mails non essentiels</button></form></main>`,
    );
  }

  const { error } = await admin
    .from("notification_email_preferences")
    .upsert(
      { user_id: userId, nonessential_opt_out: true },
      { onConflict: "user_id" },
    );
  if (error) {
    return htmlResponse(
      500,
      "<h1>La désinscription n’a pas pu être enregistrée.</h1>",
    );
  }
  return htmlResponse(
    200,
    "<main><h1>Préférence enregistrée</h1><p>Les e-mails non essentiels sont désactivés. Les messages nécessaires au suivi des commandes continueront.</p></main>",
  );
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  const fromEmail = Deno.env.get("RESEND_FROM_EMAIL");
  const webhookSecret = Deno.env.get("NOTIFY_WEBHOOK_SECRET");
  const unsubscribeSecret = Deno.env.get("EMAIL_UNSUBSCRIBE_SECRET");
  if (
    !supabaseUrl ||
    !serviceRoleKey ||
    !resendApiKey ||
    !fromEmail ||
    !webhookSecret ||
    webhookSecret.length < 32 ||
    !unsubscribeSecret ||
    unsubscribeSecret.length < 32
  ) {
    return response(500, "Le service de notification n’est pas configuré.");
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const url = new URL(request.url);
  if (url.searchParams.get("action") === "unsubscribe") {
    if (request.method !== "GET" && request.method !== "POST") {
      return response(405, "Méthode non autorisée.");
    }
    return handleUnsubscribe(request, admin, unsubscribeSecret);
  }

  if (request.method !== "POST") {
    return response(405, "Méthode non autorisée.");
  }
  const providedSecret = request.headers.get("x-notify-secret") ?? "";
  if (!constantTimeEqual(providedSecret, webhookSecret)) {
    return response(401, "Accès non autorisé.");
  }

  let requestedJobId: string | undefined;
  try {
    const body: unknown = await request.json();
    if (!isRecord(body)) return response(400, "Événement invalide.");
    if (body.job_id !== undefined) {
      if (typeof body.job_id !== "string" || !uuidPattern.test(body.job_id)) {
        return response(400, "Événement invalide.");
      }
      requestedJobId = body.job_id;
    }
  } catch {
    return response(400, "Événement invalide.");
  }

  let jobsQuery = admin
    .from("notification_email_jobs")
    .select("id")
    .eq("status", "queued")
    .lte("available_at", new Date().toISOString())
    .lt("attempts", 5)
    .order("created_at", { ascending: true })
    .limit(requestedJobId ? 1 : maxBatchSize);
  if (requestedJobId) jobsQuery = jobsQuery.eq("id", requestedJobId);
  const { data: jobs, error: jobsError } = await jobsQuery;
  if (jobsError) return response(503, "La file d’e-mails est indisponible.");

  for (const job of jobs ?? []) {
    await processJob(admin, job.id, resendApiKey, fromEmail, unsubscribeSecret);
  }
  return new Response(JSON.stringify({ processed: jobs?.length ?? 0 }), {
    status: 202,
    headers: corsHeaders,
  });
});

async function processJob(
  admin: ReturnType<typeof createClient>,
  jobId: string,
  resendApiKey: string,
  fromEmail: string,
  unsubscribeSecret: string,
) {
  const { data: currentJob } = await admin
    .from("notification_email_jobs")
    .select("id, notification_id, user_id, attempts")
    .eq("id", jobId)
    .eq("status", "queued")
    .lte("available_at", new Date().toISOString())
    .lt("attempts", 5)
    .maybeSingle();
  if (!currentJob) return;

  const nextAttempt = currentJob.attempts + 1;
  const { data: claimedJob, error: claimError } = await admin
    .from("notification_email_jobs")
    .update({ status: "sending", attempts: nextAttempt })
    .eq("id", currentJob.id)
    .eq("status", "queued")
    .select("id, notification_id, user_id, attempts")
    .maybeSingle();
  if (claimError || !claimedJob) return;

  const markForRetry = async (errorCode: string) => {
    const delayMinutes = Math.min(60, 2 ** claimedJob.attempts);
    await admin
      .from("notification_email_jobs")
      .update({
        status: claimedJob.attempts >= 5 ? "failed" : "queued",
        available_at: new Date(
          Date.now() + delayMinutes * 60_000,
        ).toISOString(),
        last_error: errorCode,
      })
      .eq("id", claimedJob.id);
  };

  const { data: recentSends, error: rateLimitError } = await admin
    .from("notification_email_jobs")
    .select("sent_at")
    .eq("user_id", claimedJob.user_id)
    .eq("status", "sent")
    .gte("sent_at", new Date(Date.now() - 60 * 60_000).toISOString())
    .order("sent_at", { ascending: true })
    .limit(maxEmailsPerUserPerHour);
  if (rateLimitError) {
    await markForRetry("rate_limit_check_failed");
    return;
  }
  if ((recentSends?.length ?? 0) >= maxEmailsPerUserPerHour) {
    const nextAvailable = new Date(
      new Date(recentSends[0].sent_at ?? Date.now()).getTime() + 60 * 60_000,
    );
    await admin
      .from("notification_email_jobs")
      .update({
        status: "queued",
        attempts: claimedJob.attempts - 1,
        available_at: nextAvailable.toISOString(),
        last_error: null,
      })
      .eq("id", claimedJob.id);
    return;
  }

  const { data: notification, error: notificationError } = await admin
    .from("notifications")
    .select("type, payload")
    .eq("id", claimedJob.notification_id)
    .eq("user_id", claimedJob.user_id)
    .maybeSingle();
  if (notificationError || !notification || !isRecord(notification.payload)) {
    await markForRetry("notification_lookup_failed");
    return;
  }

  const orderId = notification.payload.order_id;
  if (typeof orderId !== "string" || !uuidPattern.test(orderId)) {
    await admin
      .from("notification_email_jobs")
      .update({ status: "skipped", last_error: "order_reference_missing" })
      .eq("id", claimedJob.id);
    return;
  }
  const { data: order } = await admin
    .from("orders")
    .select("shop_id")
    .eq("id", orderId)
    .maybeSingle();
  if (!order) {
    await admin
      .from("notification_email_jobs")
      .update({ status: "skipped", last_error: "order_not_found" })
      .eq("id", claimedJob.id);
    return;
  }
  const { data: shop } = await admin
    .from("shops")
    .select("name")
    .eq("id", order.shop_id)
    .maybeSingle();
  const { data: userResult } = await admin.auth.admin.getUserById(
    claimedJob.user_id,
  );
  const emailAddress = userResult.user?.email;
  if (!shop?.name || !emailAddress) {
    await markForRetry("recipient_lookup_failed");
    return;
  }

  const token = await signUnsubscribeToken(
    claimedJob.user_id,
    unsubscribeSecret,
  );
  const unsubscribeUrl = `${supabaseUrl}/functions/v1/notify?action=unsubscribe&token=${encodeURIComponent(token)}`;
  const content = buildOrderEmail(
    notification.type,
    notification.payload,
    shop.name,
    unsubscribeUrl,
  );
  if (!content) {
    await admin
      .from("notification_email_jobs")
      .update({ status: "skipped", last_error: "unsupported_notification" })
      .eq("id", claimedJob.id);
    return;
  }

  try {
    await sendOrderEmail(
      {
        ...content,
        to: emailAddress,
        from: fromEmail,
        idempotencyKey: claimedJob.id,
      },
      async (message) => {
        const resendResponse = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${resendApiKey}`,
            "Content-Type": "application/json",
            "Idempotency-Key": message.idempotencyKey,
          },
          body: JSON.stringify({
            from: message.from,
            to: [message.to],
            subject: message.subject,
            html: message.html,
            text: message.text,
          }),
        });
        if (!resendResponse.ok) {
          throw new Error(`resend_http_${resendResponse.status}`);
        }
      },
    );
    await admin
      .from("notification_email_jobs")
      .update({
        status: "sent",
        sent_at: new Date().toISOString(),
        last_error: null,
      })
      .eq("id", claimedJob.id);
  } catch (error) {
    const code =
      error instanceof Error && /^resend_http_\d{3}$/.test(error.message)
        ? error.message
        : "resend_request_failed";
    await markForRetry(code);
  }
}
