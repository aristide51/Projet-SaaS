import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  FakeProvider,
  type ProviderPaymentStatus,
} from "../_shared/payment-provider.ts";
import {
  edgeErrorResponse,
  withEdgeProtection,
} from "../_shared/edge-protection.ts";

const staleAfterMs = 48 * 60 * 60 * 1000;

function isAuthorized(provided: string, expected: string) {
  let difference = provided.length ^ expected.length;
  for (
    let index = 0;
    index < Math.max(provided.length, expected.length);
    index += 1
  ) {
    difference |= (provided.charCodeAt(index) || 0) ^
      (expected.charCodeAt(index) || 0);
  }
  return difference === 0;
}

function jsonResponse(status: number, message: string) {
  const code = status === 401
    ? "UNAUTHORIZED"
    : status === 405
    ? "METHOD_NOT_ALLOWED"
    : status === 503 || status === 502
    ? "SERVICE_UNAVAILABLE"
    : "INTERNAL_ERROR";
  return edgeErrorResponse(status, code, undefined, undefined, message);
}

Deno.serve((request) =>
  withEdgeProtection(
    request,
    { policy: "payment_reconciliation" },
    async () => {
      if (request.method !== "POST") {
        return jsonResponse(405, "Méthode non autorisée.");
      }

      const cronSecret = Deno.env.get("PAYMENT_RECONCILIATION_SECRET");
      if (!cronSecret || cronSecret.length < 32) {
        return jsonResponse(503, "La réconciliation n’est pas configurée.");
      }
      if (
        !isAuthorized(
          request.headers.get("x-payment-cron-secret") ?? "",
          cronSecret,
        )
      ) {
        return jsonResponse(401, "Accès non autorisé.");
      }
      if (Deno.env.get("PAYMENT_AGGREGATOR_ENABLED") !== "true") {
        return jsonResponse(503, "Le paiement automatique est désactivé.");
      }

      const secret = Deno.env.get("FAKE_PAYMENT_WEBHOOK_SECRET");
      const supabaseUrl = Deno.env.get("SUPABASE_URL");
      const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
      if (!secret || secret.length < 32 || !supabaseUrl || !serviceRoleKey) {
        return jsonResponse(503, "La réconciliation n’est pas configurée.");
      }
      const admin = createClient(supabaseUrl, serviceRoleKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
      const provider = new FakeProvider(secret);
      const cutoff = new Date(Date.now() - staleAfterMs).toISOString();
      const { data: payments, error } = await admin
        .from("payments")
        .select("id, order_id, provider, provider_ref, created_at")
        .in("status", ["initiated", "pending"])
        .lte("created_at", cutoff)
        .not("order_id", "is", null)
        .order("created_at", { ascending: true })
        .limit(100);
      if (error) {
        return jsonResponse(503, "La file de réconciliation est indisponible.");
      }

      let checked = 0;
      let updated = 0;
      const timeBucket = Math.floor(Date.now() / staleAfterMs);
      for (const payment of payments ?? []) {
        if (
          payment.provider !== "fake" ||
          !payment.provider_ref ||
          !payment.order_id
        ) {
          continue;
        }
        const { data: order, error: orderError } = await admin
          .from("orders")
          .select("status, payment_method")
          .eq("id", payment.order_id)
          .maybeSingle();
        if (orderError) {
          return jsonResponse(503, "Une commande n’a pas pu être vérifiée.");
        }
        if (
          !order ||
          order.status !== "pending_payment" ||
          order.payment_method !== "aggregator"
        ) {
          continue;
        }

        let status: ProviderPaymentStatus;
        try {
          status = await provider.getStatus(payment.provider_ref);
        } catch {
          return jsonResponse(
            502,
            "Le statut d’un paiement ancien est indisponible.",
          );
        }
        checked += 1;
        const eventId = `reconcile:${payment.id}:${status}:${timeBucket}`;
        const { data: result, error: processError } = await admin.rpc(
          "process_aggregator_webhook",
          {
            p_provider: payment.provider,
            p_event_id: eventId,
            p_payment_id: payment.id,
            p_provider_ref: payment.provider_ref,
            p_provider_status: status,
            p_sanitized_payload: { source: "scheduled_reconciliation" },
          },
        );
        if (processError) {
          return jsonResponse(
            503,
            "Une réponse fournisseur n’a pas pu être traitée.",
          );
        }
        if (result === "paid") updated += 1;
      }

      return new Response(JSON.stringify({ checked, updated }), {
        status: 200,
      });
    },
  )
);
