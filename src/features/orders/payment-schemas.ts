import { z } from "zod";
import { normalizeBurkinaPhone } from "@/features/profile/schemas";

export const paymentDeclarationSchema = z.object({
  orderId: z.string().uuid(),
  payerPhone: z
    .string()
    .trim()
    .transform(normalizeBurkinaPhone)
    .refine((value) => value !== undefined, {
      message: "Saisis un numéro burkinabè valide de 8 chiffres.",
    })
    .transform((value) => value ?? ""),
  transactionReference: z
    .string()
    .trim()
    .toUpperCase()
    .min(4, "La référence doit contenir au moins 4 caractères.")
    .max(40, "La référence ne doit pas dépasser 40 caractères.")
    .regex(
      /^[A-Z0-9._-]+$/,
      "Utilise uniquement des lettres, chiffres, points, tirets ou tirets bas.",
    ),
});

export type PaymentDeclarationInput = z.input<typeof paymentDeclarationSchema>;
