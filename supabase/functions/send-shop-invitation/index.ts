import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  decodeJsonBody,
  edgeErrorResponse,
  withEdgeProtection,
} from "../_shared/edge-protection.ts";

type InvitationPayload = {
  invitationId: string;
  shopId: string;
  token: string;
};

function jsonResponse(status: number, message: string) {
  const code = status === 400
    ? "BAD_REQUEST"
    : status === 401
    ? "UNAUTHORIZED"
    : status === 403
    ? "FORBIDDEN"
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

function isUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      .test(
        value,
      )
  );
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

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(
    new Uint8Array(digest),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
}

Deno.serve((request) =>
  withEdgeProtection(
    request,
    { policy: "invitation" },
    async (context) => {
      if (request.method !== "POST") {
        return jsonResponse(405, "Méthode non autorisée.");
      }

      const authorization = request.headers.get("Authorization");
      if (!authorization?.startsWith("Bearer ")) {
        return jsonResponse(401, "Connexion requise.");
      }

      let payload: InvitationPayload;
      try {
        const body: unknown = decodeJsonBody(context.body);
        if (
          !isRecord(body) ||
          !isUuid(body.invitationId) ||
          !isUuid(body.shopId) ||
          typeof body.token !== "string" ||
          !/^[A-Za-z0-9_-]{43}$/.test(body.token)
        ) {
          return jsonResponse(400, "Demande d’invitation invalide.");
        }
        payload = {
          invitationId: body.invitationId,
          shopId: body.shopId,
          token: body.token,
        };
      } catch {
        return jsonResponse(400, "Demande d’invitation invalide.");
      }

      const supabaseUrl = Deno.env.get("SUPABASE_URL");
      const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
      const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
      const resendApiKey = Deno.env.get("RESEND_API_KEY");
      const fromEmail = Deno.env.get("RESEND_FROM_EMAIL");
      const appBaseUrl = Deno.env.get("APP_BASE_URL");
      if (
        !supabaseUrl ||
        !anonKey ||
        !serviceRoleKey ||
        !resendApiKey ||
        !fromEmail ||
        !appBaseUrl
      ) {
        return jsonResponse(
          500,
          "Le service d’invitation n’est pas configuré.",
        );
      }

      let appUrl: URL;
      try {
        appUrl = new URL(appBaseUrl);
      } catch {
        return jsonResponse(
          500,
          "Le service d’invitation n’est pas configuré.",
        );
      }
      if (
        appUrl.protocol !== "https:" &&
        appUrl.hostname !== "localhost" &&
        appUrl.hostname !== "127.0.0.1"
      ) {
        return jsonResponse(
          500,
          "Le service d’invitation n’est pas configuré.",
        );
      }

      try {
        const jwt = authorization.slice("Bearer ".length);
        const userClient = createClient(supabaseUrl, anonKey, {
          auth: { autoRefreshToken: false, persistSession: false },
          global: { headers: { Authorization: `Bearer ${jwt}` } },
        });
        const { data: userData, error: userError } = await userClient.auth
          .getUser();
        if (userError || !userData.user?.email_confirmed_at) {
          return jsonResponse(401, "Compte confirmé requis.");
        }
        const userLimitResponse = await context.limitUser(userData.user.id);
        if (userLimitResponse) return userLimitResponse;

        const adminClient = createClient(supabaseUrl, serviceRoleKey, {
          auth: { autoRefreshToken: false, persistSession: false },
        });
        const { data: membership, error: membershipError } = await adminClient
          .from("shop_members")
          .select("role")
          .eq("shop_id", payload.shopId)
          .eq("user_id", userData.user.id)
          .maybeSingle();
        if (membershipError) {
          return jsonResponse(500, "Impossible de vérifier les droits.");
        }
        if (membership?.role !== "owner") {
          return jsonResponse(
            403,
            "Seul le propriétaire peut envoyer une invitation.",
          );
        }

        const tokenHash = await sha256Hex(payload.token);
        const { data: invitation, error: invitationError } = await adminClient
          .from("shop_invitations")
          .select("email, status, expires_at")
          .eq("id", payload.invitationId)
          .eq("shop_id", payload.shopId)
          .eq("token_hash", tokenHash)
          .maybeSingle();
        if (invitationError) {
          return jsonResponse(500, "Impossible de vérifier l’invitation.");
        }
        if (
          !invitation ||
          invitation.status !== "pending" ||
          new Date(invitation.expires_at).getTime() <= Date.now()
        ) {
          return jsonResponse(400, "Cette invitation n’est plus valide.");
        }

        const { data: shop, error: shopError } = await adminClient
          .from("shops")
          .select("name")
          .eq("id", payload.shopId)
          .maybeSingle();
        if (shopError || !shop) {
          return jsonResponse(500, "Impossible de charger la boutique.");
        }

        const invitationUrl = new URL("/dashboard/team/accept", appUrl);
        invitationUrl.searchParams.set("token", payload.token);
        const safeShopName = escapeHtml(shop.name);
        const response = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${resendApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: fromEmail,
            to: [invitation.email],
            subject: `Invitation à rejoindre ${shop.name}`,
            html:
              `<main><h1>Rejoins ${safeShopName}</h1><p>Le propriétaire t’invite à rejoindre l’équipe de cette boutique.</p><p><a href="${invitationUrl.toString()}">Accepter l’invitation</a></p><p>Ce lien expire dans 7 jours et ne peut être utilisé qu’une fois.</p></main>`,
            text:
              `Tu es invité·e à rejoindre ${shop.name}. Accepte l’invitation dans les 7 jours : ${invitationUrl.toString()}`,
          }),
        });
        if (!response.ok) {
          return jsonResponse(
            502,
            "L’e-mail d’invitation n’a pas pu être envoyé.",
          );
        }

        return Response.json({ message: "Invitation envoyée." });
      } catch {
        return jsonResponse(
          500,
          "L’e-mail d’invitation n’a pas pu être envoyé.",
        );
      }
    },
  )
);
