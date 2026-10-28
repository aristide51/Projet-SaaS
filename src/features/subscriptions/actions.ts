"use server";

import { z } from "zod";
import { logError } from "@/lib/monitoring/sentry";
import { createClient, getUser } from "@/lib/supabase/server";
import { validateServerEnv } from "@/lib/env";

const invoiceIdSchema = z.string().uuid();
const receiptResponseSchema = z.object({ signedUrl: z.string().url() });

export type InvoiceReceiptResult =
  { success: true; signedUrl: string } | { success: false; message: string };

export async function requestInvoiceReceipt(
  invoiceId: string,
): Promise<InvoiceReceiptResult> {
  const parsedInvoiceId = invoiceIdSchema.safeParse(invoiceId);
  if (!parsedInvoiceId.success) {
    return { success: false, message: "Cette facture est invalide." };
  }

  try {
    const user = await getUser();
    if (!user.email_confirmed_at) {
      return {
        success: false,
        message: "Un compte confirmé est nécessaire pour télécharger le PDF.",
      };
    }

    const supabase = await createClient();
    const { data, error } = await supabase.functions.invoke(
      "subscription-invoice-pdf",
      { body: { invoiceId: parsedInvoiceId.data } },
    );
    if (error) {
      await logError("subscription_invoice_pdf_failed", error);
      return {
        success: false,
        message: "Le PDF n’a pas pu être préparé. Réessaie plus tard.",
      };
    }

    const parsedResponse = receiptResponseSchema.safeParse(data);
    if (!parsedResponse.success) {
      await logError(
        "subscription_invoice_pdf_invalid_response",
        parsedResponse.error,
      );
      return {
        success: false,
        message: "La réponse du service de reçus est invalide.",
      };
    }

    const expectedOrigin = new URL(validateServerEnv().NEXT_PUBLIC_SUPABASE_URL)
      .origin;
    if (new URL(parsedResponse.data.signedUrl).origin !== expectedOrigin) {
      await logError(
        "subscription_invoice_pdf_untrusted_url",
        new Error("The receipt service returned an unexpected URL origin."),
      );
      return {
        success: false,
        message: "Le lien de téléchargement est invalide.",
      };
    }
    return { success: true, signedUrl: parsedResponse.data.signedUrl };
  } catch (error) {
    await logError("subscription_invoice_pdf_failed", error);
    return {
      success: false,
      message: "Le PDF n’a pas pu être préparé. Réessaie plus tard.",
    };
  }
}
