import { z } from "zod";
import type { Database } from "@/types/database";

export type OrderStatus = Database["public"]["Enums"]["order_status"];
export type PaymentMethod = Database["public"]["Enums"]["payment_method_type"];
export type FulfillmentType = Database["public"]["Enums"]["fulfillment_type"];
export type DeclarationStatus =
  Database["public"]["Enums"]["declaration_status"];
export type ActorType = Database["public"]["Enums"]["actor_type"];

export type OrderRow = Database["public"]["Tables"]["orders"]["Row"];
export type OrderItemRow = Database["public"]["Tables"]["order_items"]["Row"];
export type OrderStatusHistoryRow =
  Database["public"]["Tables"]["order_status_history"]["Row"];
export type PaymentDeclarationRow =
  Database["public"]["Tables"]["payment_declarations"]["Row"];
export type OrderCancellationRequestRow =
  Database["public"]["Tables"]["order_cancellation_requests"]["Row"];

export type OrderWithDetails = OrderRow & {
  items: OrderItemRow[];
  declaration?: PaymentDeclarationRow;
  history: OrderStatusHistoryRow[];
  cancellationRequest?: OrderCancellationRequestRow;
};

export type OrderFilters = z.infer<
  typeof import("./schemas").orderFiltersSchema
>;

export type OrderActionResult =
  { success: true; message: string } | { success: false; message: string };

export const CUSTOMER_ORDER_PAGE_SIZE = 20;

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  pending_payment: "En attente de paiement",
  payment_declared: "Paiement déclaré",
  paid: "Payé",
  confirmed: "Confirmée",
  ready: "Prête",
  completed: "Terminée",
  cancelled: "Annulée",
  refunded: "Remboursée",
};

export const ORDER_STATUS_COLORS: Record<OrderStatus, string> = {
  pending_payment: "warning",
  payment_declared: "info",
  paid: "success",
  confirmed: "primary",
  ready: "primary",
  completed: "success",
  cancelled: "danger",
  refunded: "danger",
};
