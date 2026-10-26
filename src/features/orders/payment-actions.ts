"use server";

import { randomUUID } from "node:crypto";
import { z } from "zod";
import { logError } from "@/lib/monitoring/sentry";
import { createClient, getOptionalUser } from "@/lib/supabase/server";
import { paymentDeclarationSchema } from "./payment-schemas";

const MAX_PROOF_SIZE = 2 * 1024 * 1024;
const uuidSchema = z.string().uuid();
const PROOF_TYPES = {
  "image/jpeg": { extension: "jpg", signature: [0xff, 0xd8, 0xff] },
  "image/png": {
    extension: "png",
    signature: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  },
  "image/webp": { extension: "webp", signature: null },
} as const;

export type DeclarePaymentResult =
  { success: true } | { success: false; message: string };

function paymentError(message: string) {
  if (message.includes("reference_already_used")) {
    return "Cette référence a déjà été utilisée pour une commande de la boutique.";
  }
  if (message.includes("order_expired")) {
    return "Le délai de paiement est dépassé. Contacte la boutique pour connaître la suite.";
  }
  if (message.includes("order_not_payable")) {
    return "Cette commande n’accepte plus de déclaration de paiement.";
  }
  if (message.includes("not_a_ussd_order")) {
    return "Cette commande ne correspond pas à un paiement USSD.";
  }
  if (message.includes("invalid_screenshot_path")) {
    return "La capture ne correspond pas à cette commande.";
  }
  return "La déclaration du paiement a échoué. Vérifie les informations et réessaie.";
}

function isProofMimeType(value: string): value is keyof typeof PROOF_TYPES {
  return Object.hasOwn(PROOF_TYPES, value);
}

function hasSignature(bytes: Uint8Array, mimeType: keyof typeof PROOF_TYPES) {
  if (mimeType === "image/webp") {
    return (
      bytes.length >= 12 &&
      String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
      String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
    );
  }

  return PROOF_TYPES[mimeType].signature.every(
    (byte, index) => bytes[index] === byte,
  );
}

export async function declarePayment(
  shopId: string,
  input: unknown,
  proof?: File | null,
): Promise<DeclarePaymentResult> {
  const parsed = paymentDeclarationSchema.safeParse(input);
  if (!parsed.success || !uuidSchema.safeParse(shopId).success) {
    return {
      success: false,
      message: "Vérifie le numéro, la référence et la commande.",
    };
  }

  const user = await getOptionalUser();
  if (!user?.email_confirmed_at) {
    return {
      success: false,
      message:
        "Connecte-toi avec une adresse e-mail confirmée pour déclarer le paiement.",
    };
  }

  const supabase = await createClient();
  const { data: order, error: orderError } = await supabase
    .from("orders")
    .select("id, shop_id, status, payment_method, expires_at")
    .eq("id", parsed.data.orderId)
    .eq("shop_id", shopId)
    .eq("customer_id", user.id)
    .maybeSingle();

  if (orderError) {
    await logError("payment_declaration_failed", orderError);
    return {
      success: false,
      message: "La commande n’a pas pu être vérifiée. Recharge la page.",
    };
  }
  if (!order) {
    return { success: false, message: "Commande introuvable." };
  }
  if (!order.payment_method.startsWith("ussd_")) {
    return {
      success: false,
      message: "Cette commande ne correspond pas à un paiement USSD.",
    };
  }
  if (order.status !== "pending_payment") {
    return {
      success: false,
      message: "Cette commande n’accepte plus de déclaration de paiement.",
    };
  }
  if (order.expires_at && new Date(order.expires_at).getTime() <= Date.now()) {
    return {
      success: false,
      message:
        "Le délai de paiement est dépassé. Contacte la boutique pour connaître la suite.",
    };
  }

  let screenshotPath: string | null = null;
  if (proof && proof.size > 0) {
    if (!isProofMimeType(proof.type) || proof.size > MAX_PROOF_SIZE) {
      return {
        success: false,
        message:
          "La capture doit être une image PNG, JPEG ou WebP de 2 Mo maximum.",
      };
    }

    const metadata = PROOF_TYPES[proof.type];
    const bytes = new Uint8Array(await proof.arrayBuffer());
    if (!hasSignature(bytes, proof.type)) {
      return {
        success: false,
        message: "Le contenu du fichier ne correspond pas à une image valide.",
      };
    }

    screenshotPath = `${shopId}/${order.id}/${randomUUID()}.${metadata.extension}`;
    const { error: uploadError } = await supabase.storage
      .from("payment-proofs")
      .upload(screenshotPath, proof, {
        contentType: proof.type,
        upsert: false,
      });
    if (uploadError) {
      await logError("payment_proof_upload_failed", uploadError);
      return {
        success: false,
        message:
          "La capture n’a pas pu être envoyée. Réessaie ou continue sans capture.",
      };
    }
  }

  const { error } = await supabase.rpc("declare_payment", {
    p_order_id: order.id,
    p_payer_phone: parsed.data.payerPhone,
    p_transaction_ref: parsed.data.transactionReference,
    ...(screenshotPath ? { p_screenshot_path: screenshotPath } : {}),
  });

  if (error) {
    if (screenshotPath) {
      const { error: cleanupError } = await supabase.storage
        .from("payment-proofs")
        .remove([screenshotPath]);
      if (cleanupError) {
        await logError("payment_proof_cleanup_failed", cleanupError);
      }
    }
    const knownErrors = [
      "reference_already_used",
      "order_expired",
      "order_not_payable",
      "not_a_ussd_order",
      "invalid_screenshot_path",
    ];
    if (!knownErrors.some((knownError) => error.message.includes(knownError))) {
      await logError("payment_declaration_failed", error);
    }
    return { success: false, message: paymentError(error.message) };
  }

  return { success: true };
}
