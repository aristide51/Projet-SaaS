"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { logError } from "@/lib/monitoring/sentry";
import { createClient, getOptionalUser } from "@/lib/supabase/server";

const cancelCustomerOrderSchema = z
  .object({ orderId: z.string().uuid() })
  .strict();
const requestCustomerOrderCancellationSchema = z
  .object({
    orderId: z.string().uuid(),
    note: z.string().trim().max(500).optional(),
  })
  .strict();

export type CustomerOrderActionResult =
  { success: true; message: string } | { success: false; message: string };

export async function cancelCustomerOrder(
  input: unknown,
): Promise<CustomerOrderActionResult> {
  const parsed = cancelCustomerOrderSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, message: "Commande invalide." };
  }

  const user = await getOptionalUser();
  if (!user?.email_confirmed_at) {
    return {
      success: false,
      message: "Connecte-toi avec une adresse e-mail confirmée.",
    };
  }

  try {
    const supabase = await createClient();
    const { data: order, error: orderError } = await supabase
      .from("orders")
      .select("id, status")
      .eq("id", parsed.data.orderId)
      .eq("customer_id", user.id)
      .maybeSingle();

    if (orderError) {
      await logError("customer_order_cancel_failed", orderError);
      return {
        success: false,
        message: "La commande n’a pas pu être vérifiée. Recharge la page.",
      };
    }
    if (!order) {
      return { success: false, message: "Commande introuvable." };
    }
    if (order.status !== "pending_payment") {
      return {
        success: false,
        message:
          "Cette commande ne peut plus être annulée depuis ton compte. Contacte la boutique si nécessaire.",
      };
    }

    const { error } = await supabase.rpc("transition_order", {
      p_order_id: order.id,
      p_to: "cancelled",
    });

    if (error) {
      if (
        error.message.includes("transition_not_allowed") ||
        error.message.includes("order_not_found")
      ) {
        return {
          success: false,
          message:
            "La commande a changé et ne peut plus être annulée. Actualise la page.",
        };
      }
      await logError("customer_order_cancel_failed", error);
      return {
        success: false,
        message: "L’annulation a échoué. Vérifie le statut et réessaie.",
      };
    }

    revalidatePath("/account");
    return { success: true, message: "Commande annulée." };
  } catch (error) {
    await logError("customer_order_cancel_failed", error);
    return {
      success: false,
      message: "L’annulation a échoué. Recharge la page et réessaie.",
    };
  }
}

export async function requestCustomerOrderCancellation(
  input: unknown,
): Promise<CustomerOrderActionResult> {
  const parsed = requestCustomerOrderCancellationSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, message: "Demande invalide." };
  }

  const user = await getOptionalUser();
  if (!user?.email_confirmed_at) {
    return {
      success: false,
      message: "Connecte-toi avec une adresse e-mail confirmée.",
    };
  }

  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("request_order_cancellation", {
      p_order_id: parsed.data.orderId,
      p_customer_note: parsed.data.note ?? "",
    });

    if (error) {
      if (error.message.includes("cancellation_request_already_pending")) {
        return {
          success: false,
          message: "Une demande est déjà en attente pour cette commande.",
        };
      }
      if (
        error.message.includes("order_cancellation_request_not_allowed") ||
        error.message.includes("order_not_found") ||
        error.message.includes("forbidden")
      ) {
        return {
          success: false,
          message:
            "Cette commande ne peut pas faire l’objet d’une demande d’annulation.",
        };
      }
      await logError("customer_order_cancellation_request_failed", error);
      return {
        success: false,
        message: "La demande n’a pas pu être envoyée. Réessaie.",
      };
    }

    revalidatePath("/account");
    revalidatePath("/dashboard/orders");
    return { success: true, message: "Demande envoyée à la boutique." };
  } catch (error) {
    await logError("customer_order_cancellation_request_failed", error);
    return {
      success: false,
      message: "La demande n’a pas pu être envoyée. Recharge la page.",
    };
  }
}
