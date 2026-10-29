import { z } from "zod";

const serverEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  NEXT_PUBLIC_SITE_URL: z.string().url().optional(),
  NEXT_PUBLIC_SENTRY_DSN: z.union([z.string().url(), z.literal("")]).optional(),
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: z.string().optional(),
  NEXT_PUBLIC_SUPPORT_WHATSAPP: z
    .string()
    .regex(/^\+?[0-9]{8,15}$/)
    .or(z.literal(""))
    .optional(),
  NEXT_PUBLIC_SUPPORT_EMAIL: z.string().email().or(z.literal("")).optional(),
  TURNSTILE_SECRET_KEY: z.union([z.string().min(1), z.literal("")]).optional(),
});

export function hasSupabaseConfig(
  environment: Record<string, string | undefined> = process.env,
) {
  return Boolean(
    environment.NEXT_PUBLIC_SUPABASE_URL &&
      environment.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}

export function validateServerEnv(
  environment: Record<string, string | undefined> = process.env,
) {
  const result = serverEnvSchema.safeParse(environment);

  if (!result.success) {
    const invalidVariables = [
      ...new Set(result.error.issues.map((issue) => String(issue.path[0]))),
    ];

    throw new Error(
      `Configuration invalide : ${invalidVariables.join(", ")}. ` +
        "Renseigne ces variables dans .env.local à partir de .env.example.",
    );
  }

  return result.data;
}
