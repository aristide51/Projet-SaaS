import { z } from "zod";

export const checkoutInputSchema = z
  .object({
    cartId: z.string().uuid(),
    paymentMethod: z.enum([
      "ussd_orange",
      "ussd_moov",
      "ussd_coris",
      "cash_on_delivery",
      "pay_at_pickup",
      "aggregator",
    ]),
    fulfillment: z.enum(["pickup", "delivery"]),
    deliveryAddress: z.string().trim().max(300).optional(),
    note: z.string().trim().max(500).optional(),
    couponCode: z.string().trim().max(24).optional(),
  })
  .strict();

export type CheckoutInput = z.infer<typeof checkoutInputSchema>;
