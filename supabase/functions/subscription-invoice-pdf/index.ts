import {
  createClient,
  type SupabaseClient,
} from "https://esm.sh/@supabase/supabase-js@2";
import type { Database } from "../../../src/types/database.ts";
import {
  decodeJsonBody,
  edgeErrorResponse,
  withEdgeProtection,
} from "../_shared/edge-protection.ts";
import { buildSubscriptionReceiptPdf } from "../_shared/subscription-receipt-pdf.ts";

type UserClient = SupabaseClient<Database>;
type AdminClient = SupabaseClient<Database>;
type InvoiceRequest = { invoiceId: string };
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function response(status: number, message: string) {
  const code =
    status === 400
      ? "BAD_REQUEST"
      : status === 401
        ? "UNAUTHORIZED"
        : status === 403 || status === 404
          ? "FORBIDDEN"
          : status === 405
            ? "METHOD_NOT_ALLOWED"
            : status === 503
              ? "SERVICE_UNAVAILABLE"
              : "INTERNAL_ERROR";
  return edgeErrorResponse(status, code, undefined, undefined, message);
}

function parseInvoiceRequest(body: Uint8Array): InvoiceRequest | null {
  let value: unknown;
  try {
    value = decodeJsonBody(body);
  } catch {
    return null;
  }
  if (
    typeof value !== "object" ||
    value === null ||
    !("invoiceId" in value) ||
    typeof value.invoiceId !== "string" ||
    !uuidPattern.test(value.invoiceId)
  ) {
    return null;
  }
  return { invoiceId: value.invoiceId };
}

Deno.serve((request) =>
  withEdgeProtection(
    request,
    { policy: "invoice_receipt" },
    async (context) => {
      if (request.method !== "POST") {
        return response(405, "Méthode non autorisée.");
      }

      const authorization = request.headers.get("Authorization");
      if (!authorization?.startsWith("Bearer ")) {
        return response(401, "Connexion requise.");
      }
      const invoiceRequest = parseInvoiceRequest(context.body);
      if (!invoiceRequest) {
        return response(400, "La demande de reçu est invalide.");
      }

      const supabaseUrl = Deno.env.get("SUPABASE_URL");
      const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
      const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
      if (!supabaseUrl || !anonKey || !serviceRoleKey) {
        return response(503, "Le service de reçus est indisponible.");
      }

      const userClient: UserClient = createClient(supabaseUrl, anonKey, {
        auth: { autoRefreshToken: false, persistSession: false },
        global: { headers: { Authorization: authorization } },
      });
      const { data: userData, error: userError } =
        await userClient.auth.getUser();
      if (userError || !userData.user?.email_confirmed_at) {
        return response(401, "Un compte confirmé est requis.");
      }
      const userLimitResponse = await context.limitUser(userData.user.id);
      if (userLimitResponse) return userLimitResponse;

      const { data: accessibleInvoice, error: accessError } = await userClient
        .from("invoices")
        .select("id")
        .eq("id", invoiceRequest.invoiceId)
        .maybeSingle();
      if (accessError) {
        return response(500, "Impossible de vérifier l’accès à cette facture.");
      }
      if (!accessibleInvoice) {
        return response(404, "Cette facture est introuvable.");
      }

      const adminClient: AdminClient = createClient(
        supabaseUrl,
        serviceRoleKey,
        { auth: { autoRefreshToken: false, persistSession: false } },
      );
      const { data: invoice, error: invoiceError } = await adminClient
        .from("invoices")
        .select(
          "id, invoice_number, amount, status, period_start, period_end, due_at, paid_at, shop_id, plan_id",
        )
        .eq("id", invoiceRequest.invoiceId)
        .maybeSingle();
      if (invoiceError || !invoice) {
        return response(
          500,
          "Impossible de charger les détails de la facture.",
        );
      }
      const [shopResult, planResult] = await Promise.all([
        adminClient
          .from("shops")
          .select("name")
          .eq("id", invoice.shop_id)
          .maybeSingle(),
        adminClient
          .from("plans")
          .select("name")
          .eq("id", invoice.plan_id)
          .maybeSingle(),
      ]);
      if (
        shopResult.error ||
        planResult.error ||
        !shopResult.data ||
        !planResult.data
      ) {
        return response(500, "Impossible de préparer le reçu.");
      }

      const filePath = `${invoice.shop_id}/${invoice.id}.pdf`;
      const pdf = buildSubscriptionReceiptPdf({
        invoiceNumber: invoice.invoice_number,
        shopName: shopResult.data.name,
        planName: planResult.data.name,
        amount: invoice.amount,
        status: invoice.status,
        periodStart: invoice.period_start,
        periodEnd: invoice.period_end,
        dueAt: invoice.due_at,
        paidAt: invoice.paid_at,
      });
      const { error: uploadError } = await adminClient.storage
        .from("subscription-receipts")
        .upload(filePath, pdf, {
          contentType: "application/pdf",
          cacheControl: "300",
          upsert: true,
        });
      if (uploadError) {
        return response(500, "Impossible d’enregistrer le PDF de la facture.");
      }

      const { error: pathError } = await adminClient
        .from("invoices")
        .update({ pdf_path: filePath })
        .eq("id", invoice.id);
      if (pathError) {
        return response(500, "Impossible d’associer le PDF à la facture.");
      }

      const { data: signedUrl, error: signedUrlError } =
        await adminClient.storage
          .from("subscription-receipts")
          .createSignedUrl(filePath, 300, {
            download: `facture-${invoice.invoice_number}.pdf`,
          });
      if (signedUrlError || !signedUrl) {
        return response(500, "Impossible de préparer le téléchargement.");
      }
      return Response.json({ signedUrl: signedUrl.signedUrl });
    },
  ),
);
