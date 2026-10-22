import { z } from "zod";

const emailSchema = z
  .string()
  .trim()
  .email("Saisis une adresse e-mail valide.");

const passwordSchema = z
  .string()
  .min(8, "Le mot de passe doit contenir au moins 8 caractères.")
  .max(72, "Le mot de passe est trop long.");

const turnstileSchema = z
  .string()
  .min(1, "Confirme le contrôle anti-robot avant de continuer.");

export const signUpSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(2, "Le nom doit contenir au moins 2 caractères.")
    .max(120, "Le nom est trop long."),
  email: emailSchema,
  password: passwordSchema,
  turnstileToken: turnstileSchema,
  next: z.string().optional(),
});

export const signInSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Saisis ton mot de passe."),
  turnstileToken: turnstileSchema,
  next: z.string().optional(),
});

export const emailOnlySchema = z.object({
  email: emailSchema,
  turnstileToken: turnstileSchema,
  next: z.string().optional(),
});

export const resetPasswordSchema = z.object({
  password: passwordSchema,
  turnstileToken: turnstileSchema,
});

export type SignUpValues = z.input<typeof signUpSchema>;
export type SignInValues = z.input<typeof signInSchema>;
export type EmailOnlyValues = z.input<typeof emailOnlySchema>;
export type ResetPasswordValues = z.input<typeof resetPasswordSchema>;

export function isValidAuthEmail(email: string) {
  return emailSchema.safeParse(email).success;
}
