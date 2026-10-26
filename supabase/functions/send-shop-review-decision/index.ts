import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type DecisionPayload = {
  shopId: string;
  approved: boolean;
  reason: string | null;
};

const corsHeaders = {
  "Access-Control-Allow-Headers":
    "authorization, content-type, apikey, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Origin": "*",
  "Content-Type": "application/json",
};

function jsonResponse(status: number, message: string) {
  return new Response(JSON.stringify({ message }), {
    status,
    headers: corsHeaders,
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
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

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (request.method !== "POST") {
    return jsonResponse(405, "Méthode non autorisée.");
  }

  const authorization = request.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return jsonResponse(401, "Connexion requise.");
  }

  let payload: DecisionPayload;
  try {
    const body: unknown = await request.json();
    if (
      !isRecord(body) ||
      !isUuid(body.shopId) ||
      typeof body.approved !== "boolean" ||
      (body.reason !== null &&
        (typeof body.reason !== "string" || body.reason.length > 500))
    ) {
      return jsonResponse(400, "Demande de décision invalide.");
    }
    payload = {
      shopId: body.shopId,
      approved: body.approved,
      reason: body.reason,
    };
  } catch {
    return jsonResponse(400, "Demande de décision invalide.");
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
      "Le service d’e-mail de décision n’est pas configuré.",
    );
  }

  let appUrl: URL;
  try {
    appUrl = new URL(appBaseUrl);
  } catch {
    return jsonResponse(
      500,
      "Le service d’e-mail de décision n’est pas configuré.",
    );
  }
  if (
    appUrl.protocol !== "https:" &&
    appUrl.hostname !== "localhost" &&
    appUrl.hostname !== "127.0.0.1"
  ) {
    return jsonResponse(
      500,
      "Le service d’e-mail de décision n’est pas configuré.",
    );
  }

  try {
    const jwt = authorization.slice("Bearer ".length);
    const userClient = createClient(supabaseUrl, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    });
    const { data: userData, error: userError } =
      await userClient.auth.getUser();
    if (userError || !userData.user?.email_confirmed_at) {
      return jsonResponse(401, "Compte confirmé requis.");
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: profile, error: profileError } = await adminClient
      .from("profiles")
      .select("role_global")
      .eq("id", userData.user.id)
      .maybeSingle();
    if (profileError) {
      return jsonResponse(
        500,
        "Impossible de vérifier les droits administrateur.",
      );
    }
    if (profile?.role_global !== "admin") {
      return jsonResponse(403, "Accès réservé à l’administration.");
    }

    const { data: shop, error: shopError } = await adminClient
      .from("shops")
      .select("name, slug, created_by, review_status")
      .eq("id", payload.shopId)
      .maybeSingle();
    if (shopError || !shop) {
      return jsonResponse(404, "Boutique introuvable.");
    }
    const expectedStatus = payload.approved ? "approved" : "rejected";
    if (shop.review_status !== expectedStatus) {
      return jsonResponse(409, "La décision n’est pas à jour.");
    }

    const auditAction = payload.approved ? "shop.approved" : "shop.rejected";
    const { data: auditEntry, error: auditError } = await adminClient
      .from("audit_log")
      .select("metadata, created_at")
      .eq("shop_id", payload.shopId)
      .eq("entity_id", payload.shopId)
      .eq("actor_id", userData.user.id)
      .eq("action", auditAction)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (auditError) {
      return jsonResponse(500, "Impossible de vérifier la décision.");
    }
    if (
      !auditEntry ||
      Date.now() - new Date(auditEntry.created_at).getTime() > 5 * 60_000 ||
      typeof auditEntry.metadata !== "object" ||
      auditEntry.metadata === null ||
      Array.isArray(auditEntry.metadata) ||
      auditEntry.metadata.reason !== payload.reason
    ) {
      return jsonResponse(403, "Aucune décision récente à notifier.");
    }

    const { data: owner, error: ownerError } =
      await adminClient.auth.admin.getUserById(shop.created_by);
    if (ownerError || !owner.user?.email) {
      return jsonResponse(502, "L’adresse du propriétaire est indisponible.");
    }

    const shopUrl = new URL(`/${encodeURIComponent(shop.slug)}`, appUrl);
    const safeShopName = escapeHtml(shop.name);
    const safeReason = escapeHtml(payload.reason ?? "");
    const subject = payload.approved
      ? `Ta boutique ${shop.name} est publiée`
      : `Décision concernant ${shop.name}`;
    const html = payload.approved
      ? `<main><h1>Bonne nouvelle !</h1><p>La boutique <strong>${safeShopName}</strong> est approuvée et publiée.</p><p><a href="${shopUrl.toString()}">Voir ma boutique</a></p></main>`
      : `<main><h1>Ta boutique doit être corrigée</h1><p>La demande de publication de <strong>${safeShopName}</strong> n’a pas été approuvée.</p><p><strong>Motif :</strong> ${safeReason}</p><p>Tu peux corriger ta boutique puis la soumettre à nouveau depuis ton tableau de bord.</p></main>`;
    const text = payload.approved
      ? `Ta boutique ${shop.name} est approuvée et publiée : ${shopUrl.toString()}`
      : `La demande de publication de ${shop.name} n’a pas été approuvée. Motif : ${payload.reason ?? "à préciser"}. Corrige ta boutique puis soumets-la à nouveau.`;

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [owner.user.email],
        subject,
        html,
        text,
      }),
    });
    if (!response.ok) {
      return jsonResponse(502, "L’e-mail de décision n’a pas pu être envoyé.");
    }
    return jsonResponse(200, "E-mail de décision envoyé.");
  } catch {
    return jsonResponse(500, "L’e-mail de décision n’a pas pu être envoyé.");
  }
});
