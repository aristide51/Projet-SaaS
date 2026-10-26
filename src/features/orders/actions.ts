"use server";

import { revalidatePath } from "next/cache";
import { logError } from "@/lib/monitoring/sentry";
import { createClient, getUser } from "@/lib/supabase/server";
import {
  confirmPaymentSchema,
  rejectDeclarationSchema,
  markPaidManuallySchema,
  refundOrderSchema,
  cancelOrderSchema,
  progressOrderSchema,
  orderFiltersSchema,
  resolveCancellationRequestSchema,
} from "./schemas";
import type { OrderActionResult, OrderWithDetails } from "./types";

function failure(message: string): { success: false; message: string } {
  return { success: false, message };
}

async function getShopAccess(shopId: string) {
  const user = await getUser();
  if (!user?.email_confirmed_at) {
    return { error: "Connecte-toi avec une adresse e-mail confirmée." };
  }

  const supabase = await createClient();
  const { data: member, error } = await supabase
    .from("shop_members")
    .select("role, permissions")
    .eq("shop_id", shopId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    throw new Error("Impossible de vérifier tes droits sur cette boutique.", {
      cause: error,
    });
  }

  const permissions =
    typeof member?.permissions === "object" &&
    member.permissions !== null &&
    !Array.isArray(member.permissions)
      ? member.permissions
      : {};

  if (!member || (member.role !== "owner" && permissions.orders !== true)) {
    return {
      error:
        "Tu n'as pas le droit de consulter les commandes de cette boutique.",
    };
  }

  return { supabase, user };
}

function messageForDatabaseError(message: string) {
  if (message.includes("cancellation_request_already_resolved")) {
    return "Cette demande a déjà été traitée. Actualise la page.";
  }
  if (message.includes("cancellation_request_not_found")) {
    return "Demande introuvable.";
  }
  if (message.includes("cancellation_refund_not_allowed")) {
    return "Cette commande ne peut plus être remboursée depuis cette demande.";
  }
  if (message.includes("cancellation_without_refund_not_allowed")) {
    return "L’annulation sans remboursement est réservée aux paiements déclarés non reçus.";
  }
  if (message.includes("invalid_cancellation_resolution")) {
    return "Décision invalide.";
  }
  if (message.includes("transition_not_allowed")) {
    return "Cette transition de statut n'est pas autorisée pour cette commande.";
  }
  if (message.includes("reason_required")) {
    return "Un motif est requis pour cette action.";
  }
  if (message.includes("reject_limit_reached")) {
    return "La limite de rejets est atteinte pour cette déclaration.";
  }
  if (message.includes("refund_reference_required")) {
    return "Saisis la référence du remboursement USSD.";
  }
  if (message.includes("order_not_found")) {
    return "Commande introuvable.";
  }
  if (message.includes("aggregator_payment_requires_webhook")) {
    return "Un paiement agrégateur ne peut pas être validé manuellement. Attends le webhook.";
  }
  if (message.includes("forbidden")) {
    return "Tu n'as pas le droit d'effectuer cette action.";
  }
  return "L'action a échoué. Vérifie les informations et réessaie.";
}

export async function resolveCancellationRequest(
  shopId: string,
  input: unknown,
): Promise<OrderActionResult> {
  const parsed = resolveCancellationRequestSchema.safeParse(input);
  if (!parsed.success) {
    return failure(
      parsed.error.issues.some((issue) => issue.message === "reason_required")
        ? "Indique le motif du refus ou confirme que le paiement n’a pas été reçu."
        : "Informations de résolution invalides.",
    );
  }

  try {
    const access = await getShopAccess(shopId);
    if ("error" in access) return failure(access.error);
    const { supabase } = access;

    const { data: request, error: requestError } = await supabase
      .from("order_cancellation_requests")
      .select("id, order_id, shop_id, status")
      .eq("id", parsed.data.requestId)
      .eq("shop_id", shopId)
      .maybeSingle();
    if (requestError) {
      await logError(
        "orders_cancellation_request_resolve_failed",
        requestError,
      );
      return failure("Impossible de vérifier cette demande.");
    }
    if (!request) return failure("Demande introuvable.");
    if (request.status !== "pending") {
      return failure("Cette demande a déjà été traitée.");
    }

    const { error } = await supabase.rpc("resolve_order_cancellation_request", {
      p_request_id: request.id,
      p_resolution: parsed.data.resolution,
      ...(parsed.data.note ? { p_note: parsed.data.note } : {}),
      ...(parsed.data.refundReference
        ? { p_refund_reference: parsed.data.refundReference }
        : {}),
    });
    if (error) {
      if (
        error.message.includes("refund_reference_required") &&
        parsed.data.resolution === "refunded"
      ) {
        return failure("Saisis la référence du remboursement USSD.");
      }
      if (
        error.message.includes("forbidden") ||
        error.message.includes("cancellation_request_not_found")
      ) {
        return failure("Tu n’as pas accès à cette demande.");
      }
      await logError("orders_cancellation_request_resolve_failed", error);
      return failure(messageForDatabaseError(error.message));
    }

    revalidatePath("/dashboard/orders");
    revalidatePath(`/dashboard/orders/${request.order_id}`);
    revalidatePath("/account");
    return {
      success: true,
      message:
        parsed.data.resolution === "refunded"
          ? "Remboursement confirmé et demande traitée."
          : parsed.data.resolution === "cancelled"
            ? "Commande annulée sans remboursement."
            : "Demande refusée.",
    };
  } catch (error) {
    await logError("orders_cancellation_request_resolve_failed", error);
    return failure("La demande n’a pas pu être traitée.");
  }
}

export async function getOrders(
  shopId: string,
  filters: unknown,
): Promise<
  | { success: true; orders: OrderWithDetails[] }
  | { success: false; message: string }
> {
  const parsed = orderFiltersSchema.safeParse(filters);
  if (!parsed.success) {
    return failure("Filtres invalides.");
  }

  try {
    const access = await getShopAccess(shopId);
    if ("error" in access) return failure(access.error);
    const { supabase } = access;

    let query = supabase
      .from("orders")
      .select(
        `*, order_items(*), payment_declarations(*), order_status_history(*)`,
      )
      .eq("shop_id", shopId)
      .order("created_at", { ascending: false });

    if (parsed.data.status) {
      query = query.eq("status", parsed.data.status);
    }
    if (parsed.data.dateFrom) {
      query = query.gte("created_at", parsed.data.dateFrom);
    }
    if (parsed.data.dateTo) {
      query = query.lte("created_at", parsed.data.dateTo);
    }
    if (parsed.data.search) {
      query = query.or(
        `code.ilike.%${parsed.data.search}%,customer_name.ilike.%${parsed.data.search}%,customer_phone.ilike.%${parsed.data.search}%`,
      );
    }

    const { data, error } = await query;

    if (error) {
      await logError("orders_list_failed", error);
      return failure("Impossible de charger les commandes.");
    }

    const orderIds = (data ?? []).map((order) => order.id);
    const { data: requests, error: requestsError } = orderIds.length
      ? await supabase
          .from("order_cancellation_requests")
          .select("*")
          .eq("shop_id", shopId)
          .eq("status", "pending")
          .in("order_id", orderIds)
          .order("requested_at", { ascending: false })
      : { data: [], error: null };
    if (requestsError) {
      await logError("orders_cancellation_requests_list_failed", requestsError);
      return failure("Impossible de charger les demandes d’annulation.");
    }
    const requestByOrder = new Map(
      (requests ?? []).map((request) => [request.order_id, request]),
    );

    const orders = (data ?? []).map((row) => {
      const declarations = [...(row.payment_declarations ?? [])].sort((a, b) =>
        b.created_at.localeCompare(a.created_at),
      );
      const declaration =
        declarations.find((item) => item.status === "declared") ??
        declarations[0];
      const cancellationRequest = requestByOrder.get(row.id);

      return {
        ...row,
        items: row.order_items ?? [],
        ...(declaration ? { declaration } : {}),
        history: row.order_status_history ?? [],
        ...(cancellationRequest ? { cancellationRequest } : {}),
      };
    });

    return { success: true, orders };
  } catch (error) {
    await logError("orders_list_failed", error);
    return failure("Impossible de charger les commandes.");
  }
}

/** Récupère le détail d'une commande (items, déclaration, historique). */
export async function getOrderDetail(
  shopId: string,
  orderId: string,
): Promise<
  | { success: true; order: OrderWithDetails }
  | { success: false; message: string }
> {
  try {
    const access = await getShopAccess(shopId);
    if ("error" in access) return failure(access.error);
    const { supabase } = access;

    const { data, error } = await supabase
      .from("orders")
      .select(
        `*, order_items(*), payment_declarations(*), order_status_history(*)`,
      )
      .eq("id", orderId)
      .eq("shop_id", shopId)
      .maybeSingle();

    if (error) {
      await logError("order_detail_failed", error);
      return failure("Impossible de charger la commande.");
    }

    if (!data) {
      return failure("Commande introuvable.");
    }

    const declarations = [...(data.payment_declarations ?? [])].sort((a, b) =>
      b.created_at.localeCompare(a.created_at),
    );
    const declaration =
      declarations.find((item) => item.status === "declared") ??
      declarations[0];
    const { data: cancellationRequest, error: requestError } = await supabase
      .from("order_cancellation_requests")
      .select("*")
      .eq("shop_id", shopId)
      .eq("order_id", orderId)
      .eq("status", "pending")
      .maybeSingle();
    if (requestError) {
      await logError("orders_cancellation_requests_list_failed", requestError);
      return failure("Impossible de charger la demande d’annulation.");
    }
    const order: OrderWithDetails = {
      ...data,
      items: data.order_items ?? [],
      ...(declaration ? { declaration } : {}),
      history: data.order_status_history ?? [],
      ...(cancellationRequest ? { cancellationRequest } : {}),
    };

    return { success: true, order };
  } catch (error) {
    await logError("order_detail_failed", error);
    return failure("Impossible de charger la commande.");
  }
}

/** Confirme un paiement déclaré (USSD) : passe la commande en 'paid'. */
export async function confirmPayment(
  shopId: string,
  input: unknown,
): Promise<OrderActionResult> {
  const parsed = confirmPaymentSchema.safeParse(input);
  if (!parsed.success) {
    return failure("Données de confirmation invalides.");
  }

  try {
    const access = await getShopAccess(shopId);
    if ("error" in access) return failure(access.error);

    const { supabase } = access;

    const { data: order, error: orderError } = await supabase
      .from("orders")
      .select("id, status, payment_method")
      .eq("id", parsed.data.orderId)
      .eq("shop_id", shopId)
      .maybeSingle();

    if (orderError || !order) {
      return failure("Commande introuvable.");
    }
    if (order.status !== "payment_declared") {
      return failure(
        "Cette commande n'est pas en attente de confirmation de paiement.",
      );
    }

    const { error } = await supabase.rpc("transition_order", {
      p_order_id: parsed.data.orderId,
      p_to: "paid",
      ...(parsed.data.note ? { p_note: parsed.data.note } : {}),
      ...(parsed.data.transactionRef
        ? { p_reference: parsed.data.transactionRef }
        : {}),
    });

    if (error) {
      await logError("orders_confirm_payment_failed", error);
      return failure(messageForDatabaseError(error.message));
    }

    revalidatePath(`/dashboard/orders`);
    revalidatePath(`/dashboard/orders/${parsed.data.orderId}`);
    return {
      success: true,
      message: "Paiement confirmé. La commande est passée en statut 'Payé'.",
    };
  } catch (error) {
    await logError("orders_confirm_payment_failed", error);
    return failure("La confirmation du paiement a échoué.");
  }
}

/** Rejette une déclaration de paiement : repasse en 'pending_payment' avec motif. */
export async function rejectDeclaration(
  shopId: string,
  input: unknown,
): Promise<OrderActionResult> {
  const parsed = rejectDeclarationSchema.safeParse(input);
  if (!parsed.success) {
    return failure("Motif de rejet invalide.");
  }

  try {
    const access = await getShopAccess(shopId);
    if ("error" in access) return failure(access.error);

    const { supabase } = access;

    const { data: order, error: orderError } = await supabase
      .from("orders")
      .select("id, status, payment_method")
      .eq("id", parsed.data.orderId)
      .eq("shop_id", shopId)
      .maybeSingle();

    if (orderError || !order) {
      return failure("Commande introuvable.");
    }
    if (order.status !== "payment_declared") {
      return failure(
        "Cette commande n'est pas en état de déclaration de paiement.",
      );
    }

    const { error } = await supabase.rpc("transition_order", {
      p_order_id: parsed.data.orderId,
      p_to: "pending_payment",
      p_note: parsed.data.reason,
    });

    if (error) {
      await logError("orders_reject_declaration_failed", error);
      return failure(messageForDatabaseError(error.message));
    }

    revalidatePath(`/dashboard/orders`);
    revalidatePath(`/dashboard/orders/${parsed.data.orderId}`);
    return {
      success: true,
      message:
        "Déclaration rejetée. La commande est repassée en 'En attente de paiement'.",
    };
  } catch (error) {
    await logError("orders_reject_declaration_failed", error);
    return failure("Le rejet de la déclaration a échoué.");
  }
}

/** Marque une commande comme payée manuellement (livraison / retrait). */
export async function markPaidManually(
  shopId: string,
  input: unknown,
): Promise<OrderActionResult> {
  const parsed = markPaidManuallySchema.safeParse(input);
  if (!parsed.success) {
    return failure("Données de paiement manuel invalides.");
  }

  try {
    const access = await getShopAccess(shopId);
    if ("error" in access) return failure(access.error);

    const { supabase } = access;

    const { data: order, error: orderError } = await supabase
      .from("orders")
      .select("id, status, payment_method")
      .eq("id", parsed.data.orderId)
      .eq("shop_id", shopId)
      .maybeSingle();

    if (orderError || !order) {
      return failure("Commande introuvable.");
    }
    if (order.status !== "pending_payment") {
      return failure("Cette commande n'est pas en attente de paiement.");
    }
    if (!["cash_on_delivery", "pay_at_pickup"].includes(order.payment_method)) {
      return failure(
        "Le paiement manuel est réservé aux modes 'Paiement à la livraison' ou 'Paiement au retrait'.",
      );
    }

    const { error } = await supabase.rpc("transition_order", {
      p_order_id: parsed.data.orderId,
      p_to: "paid",
      ...(parsed.data.note ? { p_note: parsed.data.note } : {}),
    });

    if (error) {
      await logError("orders_mark_paid_manually_failed", error);
      return failure(messageForDatabaseError(error.message));
    }

    revalidatePath(`/dashboard/orders`);
    revalidatePath(`/dashboard/orders/${parsed.data.orderId}`);
    return { success: true, message: "Commande marquée comme payée." };
  } catch (error) {
    await logError("orders_mark_paid_manually_failed", error);
    return failure("Le marquage du paiement manuel a échoué.");
  }
}

/** Avance une commande dans les étapes de préparation autorisées en base. */
export async function progressOrder(
  shopId: string,
  input: unknown,
): Promise<OrderActionResult> {
  const parsed = progressOrderSchema.safeParse(input);
  if (!parsed.success) {
    return failure("Étape de commande invalide.");
  }

  const expectedStatus = {
    confirmed: "paid",
    ready: "confirmed",
    completed: "ready",
  } as const;

  try {
    const access = await getShopAccess(shopId);
    if ("error" in access) return failure(access.error);

    const { supabase } = access;
    const { data: order, error: orderError } = await supabase
      .from("orders")
      .select("id, status, payment_method")
      .eq("id", parsed.data.orderId)
      .eq("shop_id", shopId)
      .maybeSingle();

    if (orderError) {
      await logError("orders_progress_status_failed", orderError);
      return failure("Impossible de vérifier le statut de la commande.");
    }
    if (!order) {
      return failure("Commande introuvable.");
    }
    if (order.status !== expectedStatus[parsed.data.nextStatus]) {
      return failure(
        "La commande a changé. Actualise la page avant de continuer.",
      );
    }

    const { error } = await supabase.rpc("transition_order", {
      p_order_id: order.id,
      p_to: parsed.data.nextStatus,
    });

    if (error) {
      await logError("orders_progress_status_failed", error);
      return failure(messageForDatabaseError(error.message));
    }

    revalidatePath("/dashboard/orders");
    revalidatePath(`/dashboard/orders/${order.id}`);
    return {
      success: true,
      message: `Commande mise à jour : ${parsed.data.nextStatus === "confirmed" ? "confirmée" : parsed.data.nextStatus === "ready" ? "prête" : "terminée"}. Le client sera informé.`,
    };
  } catch (error) {
    await logError("orders_progress_status_failed", error);
    return failure("La mise à jour de la commande a échoué.");
  }
}

/** Rembourse une commande : passe en 'refunded' avec référence de remboursement. */
export async function refundOrder(
  shopId: string,
  input: unknown,
): Promise<OrderActionResult> {
  const parsed = refundOrderSchema.safeParse(input);
  if (!parsed.success) {
    return failure("Référence de remboursement invalide.");
  }

  try {
    const access = await getShopAccess(shopId);
    if ("error" in access) return failure(access.error);

    const { supabase } = access;

    const { data: order, error: orderError } = await supabase
      .from("orders")
      .select("id, status, payment_method")
      .eq("id", parsed.data.orderId)
      .eq("shop_id", shopId)
      .maybeSingle();

    if (orderError || !order) {
      return failure("Commande introuvable.");
    }
    if (!["paid", "confirmed", "ready"].includes(order.status)) {
      return failure(
        "Seules les commandes payées, confirmées ou prêtes peuvent être remboursées.",
      );
    }
    if (
      order.payment_method.startsWith("ussd_") &&
      !parsed.data.refundReference?.trim()
    ) {
      return failure("Saisis la référence du remboursement USSD.");
    }

    const { error } = await supabase.rpc("transition_order", {
      p_order_id: parsed.data.orderId,
      p_to: "refunded",
      ...(parsed.data.note ? { p_note: parsed.data.note } : {}),
      ...(parsed.data.refundReference
        ? { p_reference: parsed.data.refundReference }
        : {}),
    });

    if (error) {
      await logError("orders_refund_failed", error);
      return failure(messageForDatabaseError(error.message));
    }

    revalidatePath(`/dashboard/orders`);
    revalidatePath(`/dashboard/orders/${parsed.data.orderId}`);
    return { success: true, message: "Commande remboursée." };
  } catch (error) {
    await logError("orders_refund_failed", error);
    return failure("Le remboursement a échoué.");
  }
}

/** Annule une commande avec motif obligatoire. */
export async function cancelOrder(
  shopId: string,
  input: unknown,
): Promise<OrderActionResult> {
  const parsed = cancelOrderSchema.safeParse(input);
  if (!parsed.success) {
    return failure("Motif d'annulation invalide.");
  }

  try {
    const access = await getShopAccess(shopId);
    if ("error" in access) return failure(access.error);

    const { supabase } = access;

    const { data: order, error: orderError } = await supabase
      .from("orders")
      .select("id, status")
      .eq("id", parsed.data.orderId)
      .eq("shop_id", shopId)
      .maybeSingle();

    if (orderError || !order) {
      return failure("Commande introuvable.");
    }
    if (order.status !== "pending_payment") {
      return failure(
        "Une commande dont le paiement est déclaré doit passer par la demande d’annulation afin de vérifier si un remboursement est nécessaire.",
      );
    }

    const { error } = await supabase.rpc("transition_order", {
      p_order_id: parsed.data.orderId,
      p_to: "cancelled",
      p_note: parsed.data.reason,
    });

    if (error) {
      await logError("orders_cancel_failed", error);
      return failure(messageForDatabaseError(error.message));
    }

    revalidatePath(`/dashboard/orders`);
    revalidatePath(`/dashboard/orders/${parsed.data.orderId}`);
    return { success: true, message: "Commande annulée." };
  } catch (error) {
    await logError("orders_cancel_failed", error);
    return failure("L'annulation de la commande a échoué.");
  }
}

/** Génère un CSV des commandes filtrées (retourné sous forme de texte). */
export async function exportOrdersCsv(
  shopId: string,
  filters: unknown,
): Promise<
  | { success: true; csv: string; filename: string }
  | { success: false; message: string }
> {
  const parsed = orderFiltersSchema.safeParse(filters);
  if (!parsed.success) {
    return failure("Filtres invalides.");
  }

  try {
    const access = await getShopAccess(shopId);
    if ("error" in access) return failure(access.error);
    const { supabase } = access;

    let query = supabase
      .from("orders")
      .select(
        `code, customer_name, customer_phone, status, payment_method, subtotal, discount, total, created_at`,
      )
      .eq("shop_id", shopId)
      .order("created_at", { ascending: false });

    if (parsed.data.status) {
      query = query.eq("status", parsed.data.status);
    }
    if (parsed.data.dateFrom) {
      query = query.gte("created_at", parsed.data.dateFrom);
    }
    if (parsed.data.dateTo) {
      query = query.lte("created_at", parsed.data.dateTo);
    }

    const { data, error } = await query;

    if (error) {
      await logError("orders_export_csv_failed", error);
      return failure("Impossible d'exporter les commandes.");
    }

    const rows = data ?? [];
    const header = [
      "Code",
      "Client",
      "Téléphone",
      "Statut",
      "Mode de paiement",
      "Sous-total (FCFA)",
      "Remise (FCFA)",
      "Total (FCFA)",
      "Date",
    ].join(";");

    const csvCell = (value: string | number | null) => {
      if (typeof value === "number") return String(value);
      const safeValue = value ?? "";
      const protectedValue = /^[\s]*[=+\-@]/.test(safeValue)
        ? `'${safeValue}`
        : safeValue;
      return `"${protectedValue.replace(/"/g, '""')}"`;
    };
    const lines = rows.map((row) =>
      [
        row.code,
        row.customer_name,
        row.customer_phone,
        row.status,
        row.payment_method,
        row.subtotal,
        row.discount,
        row.total,
        row.created_at,
      ]
        .map(csvCell)
        .join(";"),
    );

    const csv = [header, ...lines].join("\n");
    const filename = `commandes_${shopId}_${new Date().toISOString().slice(0, 10)}.csv`;

    return { success: true, csv, filename };
  } catch (error) {
    await logError("orders_export_csv_failed", error);
    return failure("L'export CSV a échoué.");
  }
}
