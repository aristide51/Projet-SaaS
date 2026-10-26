import { z } from "zod";

export const orderStatusSchema = z.enum([
  "pending_payment",
  "payment_declared",
  "paid",
  "confirmed",
  "ready",
  "completed",
  "cancelled",
  "refunded",
]);

export const orderFiltersSchema = z
  .object({
    status: orderStatusSchema.optional(),
    dateFrom: z.string().datetime().optional(),
    dateTo: z.string().datetime().optional(),
    search: z.string().min(1).max(100).optional(),
  })
  .strict();

export const confirmPaymentSchema = z
  .object({
    orderId: z.string().uuid(),
    transactionRef: z.string().min(1).max(40).optional(),
    note: z.string().max(500).optional(),
  })
  .strict();

export const rejectDeclarationSchema = z
  .object({
    orderId: z.string().uuid(),
    reason: z.string().min(1).max(500),
  })
  .strict();

export const markPaidManuallySchema = z
  .object({
    orderId: z.string().uuid(),
    note: z.string().max(500).optional(),
  })
  .strict();

export const refundOrderSchema = z
  .object({
    orderId: z.string().uuid(),
    refundReference: z.string().min(1).max(40).optional(),
    note: z.string().max(500).optional(),
  })
  .strict();

export const cancelOrderSchema = z
  .object({
    orderId: z.string().uuid(),
    reason: z.string().min(1).max(500),
  })
  .strict();

export const progressOrderSchema = z
  .object({
    orderId: z.string().uuid(),
    nextStatus: z.enum(["confirmed", "ready", "completed"]),
  })
  .strict();

export const resolveCancellationRequestSchema = z
  .object({
    requestId: z.string().uuid(),
    resolution: z.enum(["refunded", "cancelled", "rejected"]),
    note: z.string().trim().max(500).optional(),
    refundReference: z.string().trim().min(1).max(40).optional(),
  })
  .strict()
  .refine(
    (value) =>
      !["cancelled", "rejected"].includes(value.resolution) ||
      Boolean(value.note),
    { message: "reason_required", path: ["note"] },
  );
