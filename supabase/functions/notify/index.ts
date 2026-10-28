import {
  createClient,
  type SupabaseClient,
} from "https://esm.sh/@supabase/supabase-js@2";
import type { Database } from "../../../src/types/database.ts";
import { signBookingCancelToken } from "../_shared/booking-cancel-token.ts";
import { buildOrderEmail, sendOrderEmail } from "../_shared/order-email.ts";
import {
  decodeFormBody,
  decodeJsonBody,
  type EdgeContext,
  edgeErrorResponse,
  withEdgeProtection,
} from "../_shared/edge-protection.ts";

const maxEmailsPerUserPerHour = 10;
const maxBatchSize = 20;
type AdminClient = SupabaseClient<Database>;
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function response(status: number, message: string) {
  const code =
    status === 400
      ? "BAD_REQUEST"
      : status === 401
        ? "UNAUTHORIZED"
        : status === 405
          ? "METHOD_NOT_ALLOWED"
          : status === 503 || status === 502
            ? "SERVICE_UNAVAILABLE"
            : "INTERNAL_ERROR";
  return edgeErrorResponse(status, code, undefined, undefined, message);
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
  if (status >= 400) {
    const code =
      status === 400
        ? "BAD_REQUEST"
        : status === 503
          ? "SERVICE_UNAVAILABLE"
          : "INTERNAL_ERROR";
    return edgeErrorResponse(status, code);
  }
  return new Response(html, {
    status,
    headers: {
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
  context: EdgeContext,
  admin: AdminClient,
  unsubscribeSecret: string,
) {
  const url = new URL(request.url);
  const token =
    request.method === "GET"
      ? url.searchParams.get("token")
      : (await decodeFormBody(context)).get("token");
  if (typeof token !== "string") {
    return htmlResponse(400, "<h1>Lien de désinscription invalide.</h1>");
  }

  const userId = await verifyUnsubscribeToken(token, unsubscribeSecret);
  if (!userId) {
    return htmlResponse(400, "<h1>Ce lien de désinscription a expiré.</h1>");
  }

  if (request.method === "GET") {
    const actionUrl = `${Deno.env.get(
      "SUPABASE_URL",
    )}/functions/v1/notify?action=unsubscribe`;
    return htmlResponse(
      200,
      `<main><h1>Gérer les e-mails non essentiels</h1><p>Les e-mails indispensables au suivi des commandes continueront d’être envoyés.</p><form method="post" action="${escapeHtml(
        actionUrl,
      )}"><input type="hidden" name="token" value="${escapeHtml(
        token,
      )}"><button type="submit">Me désinscrire des e-mails non essentiels</button></form></main>`,
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

Deno.serve((request) =>
  withEdgeProtection(
    request,
    {
      policy: (incomingRequest) =>
        new URL(incomingRequest.url).searchParams.get("action") ===
        "unsubscribe"
          ? "unsubscribe"
          : "notification",
    },
    async (context) => {
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

      const admin = createClient<Database>(supabaseUrl, serviceRoleKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
      const url = new URL(request.url);
      if (url.searchParams.get("action") === "unsubscribe") {
        if (request.method !== "GET" && request.method !== "POST") {
          return response(405, "Méthode non autorisée.");
        }
        return handleUnsubscribe(request, context, admin, unsubscribeSecret);
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
        const body: unknown = decodeJsonBody(context.body);
        if (!isRecord(body)) return response(400, "Événement invalide.");
        if (body.job_id !== undefined) {
          if (
            typeof body.job_id !== "string" ||
            !uuidPattern.test(body.job_id)
          ) {
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
      if (jobsError) {
        return response(503, "La file d’e-mails est indisponible.");
      }

      for (const job of jobs ?? []) {
        await processJob(
          admin,
          supabaseUrl,
          job.id,
          resendApiKey,
          fromEmail,
          unsubscribeSecret,
          Deno.env.get("BOOKING_CANCEL_TOKEN_SECRET") ?? "",
          Deno.env.get("APP_BASE_URL") ?? "",
        );
      }
      return Response.json({ processed: jobs?.length ?? 0 }, { status: 202 });
    },
  ),
);

async function processJob(
  admin: AdminClient,
  supabaseUrl: string,
  jobId: string,
  resendApiKey: string,
  fromEmail: string,
  unsubscribeSecret: string,
  bookingCancelSecret: string,
  appBaseUrl: string,
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

  let shopId: string | undefined;
  let emailPayload = notification.payload;
  let bookingCancelUrl: string | undefined;
  if (notification.type === "subscription_reminder") {
    const payloadShopId = notification.payload.shop_id;
    if (typeof payloadShopId === "string" && uuidPattern.test(payloadShopId)) {
      shopId = payloadShopId;
    }
  } else if (notification.type === "booking_reminder") {
    const bookingId = notification.payload.booking_id;
    const stage = notification.payload.reminder_stage;
    if (
      typeof bookingId !== "string" ||
      !uuidPattern.test(bookingId) ||
      (stage !== "24_hours" && stage !== "2_hours")
    ) {
      await admin
        .from("notification_email_jobs")
        .update({ status: "skipped", last_error: "booking_reference_invalid" })
        .eq("id", claimedJob.id);
      return;
    }

    const { data: booking, error: bookingError } = await admin
      .from("bookings")
      .select("shop_id, service_id, status, during")
      .eq("id", bookingId)
      .maybeSingle();
    if (bookingError) {
      await markForRetry("booking_lookup_failed");
      return;
    }
    if (!booking || !["pending", "confirmed"].includes(booking.status)) {
      await admin
        .from("notification_email_jobs")
        .update({ status: "skipped", last_error: "booking_not_active" })
        .eq("id", claimedJob.id);
      return;
    }
    const range = typeof booking.during === "string" ? booking.during : "";
    const rawStartsAt = range.startsWith("[")
      ? range.slice(1, range.indexOf(","))
      : "";
    const normalizedStartsAt = rawStartsAt
      .replace(" ", "T")
      .replace(/([+-]\d{2})$/, "$1:00");
    const appointmentDate = new Date(normalizedStartsAt);
    if (!rawStartsAt || !Number.isFinite(appointmentDate.getTime())) {
      await markForRetry("booking_time_invalid");
      return;
    }
    const startsAt = appointmentDate.toISOString();
    const { data: service, error: serviceError } = await admin
      .from("services")
      .select("name")
      .eq("id", booking.service_id)
      .maybeSingle();
    if (serviceError || !service?.name) {
      await markForRetry("booking_service_lookup_failed");
      return;
    }
    if (!bookingCancelSecret || bookingCancelSecret.length < 32 || !appBaseUrl) {
      await markForRetry("booking_cancel_link_not_configured");
      return;
    }
    let appOrigin: string;
    try {
      const parsedAppUrl = new URL(appBaseUrl);
      if (
        parsedAppUrl.protocol !== "https:" &&
        parsedAppUrl.hostname !== "localhost" &&
        parsedAppUrl.hostname !== "127.0.0.1"
      ) {
        await markForRetry("booking_cancel_link_not_configured");
        return;
      }
      appOrigin = parsedAppUrl.origin;
    } catch {
      await markForRetry("booking_cancel_link_not_configured");
      return;
    }
    const { data: expiresAt, error: tokenError } = await admin.rpc(
      "issue_booking_cancel_token",
      { p_booking_id: bookingId, p_reminder_stage: stage },
    );
    if (tokenError) {
      await markForRetry("booking_cancel_token_issue_failed");
      return;
    }
    if (expiresAt) {
      const signedToken = await signBookingCancelToken(
        {
          booking_id: bookingId,
          reminder_stage: stage,
          expires_at: expiresAt,
        },
        bookingCancelSecret,
      );
      bookingCancelUrl = `${appOrigin}/booking-cancel?token=${encodeURIComponent(signedToken)}`;
    }
    shopId = booking.shop_id;
    emailPayload = {
      ...notification.payload,
      appointment_at: startsAt,
      service_name: service.name,
      cancel_url: bookingCancelUrl,
    };
  } else {
    const orderId = notification.payload.order_id;
    if (typeof orderId === "string" && uuidPattern.test(orderId)) {
      const { data: order } = await admin
        .from("orders")
        .select("shop_id")
        .eq("id", orderId)
        .maybeSingle();
      shopId = order?.shop_id;
    }
  }
  if (!shopId) {
    await admin
      .from("notification_email_jobs")
      .update({ status: "skipped", last_error: "shop_reference_missing" })
      .eq("id", claimedJob.id);
    return;
  }
  const { data: shop } = await admin
    .from("shops")
    .select("name")
    .eq("id", shopId)
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
  const unsubscribeUrl = `${supabaseUrl}/functions/v1/notify?action=unsubscribe&token=${encodeURIComponent(
    token,
  )}`;
  const content = buildOrderEmail(
    notification.type,
    emailPayload,
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
