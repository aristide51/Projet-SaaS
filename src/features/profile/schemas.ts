import { z } from "zod";

const phoneError =
  "Saisis un numéro burkinabè valide de 8 chiffres, par exemple 70 00 00 00.";

export function normalizeBurkinaPhone(value: string) {
  const digits = value.replace(/\D/g, "");
  let nationalNumber: string;

  if (digits.length === 8) {
    nationalNumber = digits;
  } else if (digits.length === 11 && digits.startsWith("226")) {
    nationalNumber = digits.slice(3);
  } else if (digits.length === 13 && digits.startsWith("00226")) {
    nationalNumber = digits.slice(5);
  } else {
    return undefined;
  }

  return /^\d{8}$/.test(nationalNumber) ? `+226${nationalNumber}` : undefined;
}

const profilePhoneSchema = z
  .string()
  .trim()
  .transform((value) => (value ? normalizeBurkinaPhone(value) : null))
  .refine((value) => value !== undefined, phoneError)
  .transform((value) => value ?? null);

export const profileSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(2, "Le nom doit contenir au moins 2 caractères.")
    .max(120, "Le nom est trop long."),
  phone: profilePhoneSchema,
});

export const phoneOnlySchema = z.object({
  phone: profilePhoneSchema.refine(
    (value) => value !== null,
    "Saisis ton numéro de téléphone pour continuer.",
  ),
});

export type ProfileValues = z.input<typeof profileSchema>;
