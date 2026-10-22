import { z } from "zod";

export const authFormSchema = z.object({
  fullName: z.string(),
  email: z.string(),
  password: z.string(),
  turnstileToken: z.string(),
  next: z.string(),
});

export type AuthFormValues = z.infer<typeof authFormSchema>;

export function createAuthFormSchema(mode: string) {
  return authFormSchema.superRefine((values, context) => {
    const emailModes = new Set(["login", "signup", "magic", "forgot"]);

    if (
      emailModes.has(mode) &&
      !z.email().safeParse(values.email.trim()).success
    ) {
      context.addIssue({
        code: "custom",
        path: ["email"],
        message: "Saisis une adresse e-mail valide.",
      });
    }

    if (mode === "signup" && values.fullName.trim().length < 2) {
      context.addIssue({
        code: "custom",
        path: ["fullName"],
        message: "Le nom doit contenir au moins 2 caractères.",
      });
    }

    if (["signup", "login", "reset"].includes(mode)) {
      const minimum = mode === "login" ? 1 : 8;

      if (values.password.length < minimum) {
        context.addIssue({
          code: "custom",
          path: ["password"],
          message:
            mode === "login"
              ? "Saisis ton mot de passe."
              : "Le mot de passe doit contenir au moins 8 caractères.",
        });
      }

      if (values.password.length > 72) {
        context.addIssue({
          code: "custom",
          path: ["password"],
          message: "Le mot de passe est trop long.",
        });
      }
    }

    if (!values.turnstileToken) {
      context.addIssue({
        code: "custom",
        path: ["turnstileToken"],
        message: "Confirme le contrôle anti-robot avant de continuer.",
      });
    }
  });
}
