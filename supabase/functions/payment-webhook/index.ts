import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  FakeProvider,
  type ProviderPaymentStatus,
  type ProviderWebhookEvent,
  WebhookValidationError,
} from "../_shared/payment-provider.ts";
import {
  edgeErrorResponse,
  withEdgeProtection,
} from "../_shared/edge-protection.ts";

function jsonResponse(status: number, message: string) {
  const code = status === 401
    ? "UNAUTHORIZED"
    : status === 404
    ? "FORBIDDEN"
    : status === 413
    ? "BAD_REQUEST"
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
    { policy: "payment_webhook" },
    async (context) => {
      if (request.method !== "POST") {
        return jsonResponse(405, "Méthode non autorisée.");
      }
      if (Deno.env.get("PAYMENT_AGGREGATOR_ENABLED") !== "true") {
        return jsonResponse(404, "Le paiement automatique est désactivé.");
      }

      const url = new URL(request.url);
      const providerName = url.searchParams.get("provider");
      if (providerName !== "fake") {
        return jsonResponse(404, "Fournisseur de paiement indisponible.");
      }

      const secret = Deno.env.get("FAKE_PAYMENT_WEBHOOK_SECRET");
      const supabaseUrl = Deno.env.get("SUPABASE_URL");
      const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
      if (!secret || secret.length < 32 || !supabaseUrl || !serviceRoleKey) {
        return jsonResponse(503, "Le webhook de paiement n’est pas configuré.");
      }

      const rawBody = new TextDecoder().decode(context.body);
      if (rawBody.length > 16_384) {
        return jsonResponse(413, "Événement trop volumineux.");
      }
      const signature = request.headers.get("x-provider-signature") ?? "";
      const provider = new FakeProvider(secret);
      const admin = createClient(supabaseUrl, serviceRoleKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      });

      let event: ProviderWebhookEvent;
      try {
        event = await provider.verifyWebhook(rawBody, signature);
      } catch (error) {
        if (error instanceof WebhookValidationError) {
          return jsonResponse(401, "Le webhook de paiement a été refusé.");
        }
        return jsonResponse(
          503,
          "La signature du webhook n’a pas pu être vérifiée.",
        );
      }

      let status: ProviderPaymentStatus;
      try {
        status = await provider.getStatus(event.providerRef);
      } catch {
        return jsonResponse(
          502,
          "Le statut du paiement n’a pas pu être vérifié.",
        );
      }

      const { data: payment, error: paymentError } = await admin
        .from("payments")
        .select("id, provider_ref")
        .eq("provider", providerName)
        .eq("provider_ref", event.providerRef)
        .maybeSingle();
      if (paymentError) {
        return jsonResponse(503, "Le paiement n’a pas pu être chargé.");
      }
      if (!payment) {
        return Response.json({ accepted: true, result: "ignored" }, {
          status: 202,
        });
      }

      const { data, error } = await admin.rpc("process_aggregator_webhook", {
        p_provider: providerName,
        p_event_id: event.eventId,
        p_payment_id: payment.id,
        p_provider_ref: payment.provider_ref,
        p_provider_status: status,
        p_sanitized_payload: { source: "signed_provider_webhook" },
      });
      if (error) {
        return jsonResponse(503, "Le webhook n’a pas pu être enregistré.");
      }
      if (
        data !== "duplicate" &&
        data !== "ignored" &&
        data !== "paid" &&
        data !== "recorded"
      ) {
        return jsonResponse(503, "La réponse du processeur est invalide.");
      }
      return Response.json({ accepted: true, result: data }, { status: 202 });
    },
  )
);
