import {
  createClient,
  type SupabaseClient,
} from "https://esm.sh/@supabase/supabase-js@2";
import type { Database } from "../../../src/types/database.ts";
import { verifyBookingCancelToken } from "../_shared/booking-cancel-token.ts";
import {
  decodeFormBody,
  withEdgeProtection,
} from "../_shared/edge-protection.ts";

type AdminClient = SupabaseClient<Database>;

function htmlResponse(status: number, content: string) {
  return new Response(
    `<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Annulation du rendez-vous</title><body><main>${content}</main></body></html>`,
    {
      status,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    },
  );
}

Deno.serve((request) =>
  withEdgeProtection(
    request,
    { policy: "booking_cancel" },
    async (context) => {
      if (request.method !== "POST") {
        return htmlResponse(
          405,
          "<h1>Confirme l’annulation depuis la page de réservation.</h1>",
        );
      }

      const supabaseUrl = Deno.env.get("SUPABASE_URL");
      const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
      const tokenSecret = Deno.env.get("BOOKING_CANCEL_TOKEN_SECRET");
      if (
        !supabaseUrl ||
        !serviceRoleKey ||
        !tokenSecret ||
        tokenSecret.length < 32
      ) {
        return htmlResponse(
          503,
          "<h1>Le service d’annulation est indisponible.</h1>",
        );
      }

      let token: string;
      try {
        const form = await decodeFormBody(context);
        const value = form.get("token");
        if (typeof value !== "string" || value.length > 2_048) {
          return htmlResponse(400, "<h1>Ce lien d’annulation est invalide.</h1>");
        }
        token = value;
      } catch {
        return htmlResponse(400, "<h1>La demande est invalide.</h1>");
      }

      const payload = await verifyBookingCancelToken(token, tokenSecret);
      if (!payload) {
        return htmlResponse(
          400,
          "<h1>Ce lien est invalide ou a expiré.</h1><p>Consulte tes rendez-vous pour vérifier leur statut.</p>",
        );
      }

      const admin: AdminClient = createClient<Database>(
        supabaseUrl,
        serviceRoleKey,
        { auth: { autoRefreshToken: false, persistSession: false } },
      );
      const { error } = await admin.rpc("redeem_booking_cancel_token", {
        p_booking_id: payload.booking_id,
        p_reminder_stage: payload.reminder_stage,
        p_expires_at: payload.expires_at,
      });
      if (error) {
        const message = error.message;
        if (
          message.includes("booking_cancel_link_used") ||
          message.includes("booking_not_cancellable")
        ) {
          return htmlResponse(
            409,
            "<h1>Ce rendez-vous ne peut plus être annulé depuis ce lien.</h1><p>Consulte tes rendez-vous pour vérifier son statut.</p>",
          );
        }
        if (message.includes("cancellation_too_late")) {
          return htmlResponse(
            409,
            "<h1>Le délai d’annulation est dépassé.</h1><p>Contacte directement la boutique pour toute modification.</p>",
          );
        }
        if (message.includes("booking_cancel_link_expired")) {
          return htmlResponse(400, "<h1>Ce lien a expiré.</h1>");
        }
        return htmlResponse(
          503,
          "<h1>L’annulation n’a pas pu être enregistrée.</h1><p>Réessaie ou contacte la boutique.</p>",
        );
      }

      return htmlResponse(
        200,
        "<h1>Rendez-vous annulé</h1><p>La boutique a été informée de ton annulation.</p>",
      );
    },
  ),
);
