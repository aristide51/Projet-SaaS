import { z } from "zod";

const turnstileResponseSchema = z.object({
  success: z.boolean(),
});

export async function verifyTurnstileToken(
  token: string,
  remoteIp?: string,
): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;

  if (!secret) {
    throw new Error("La vérification Turnstile n’est pas configurée.");
  }

  if (!token.trim()) {
    return false;
  }

  const body = new URLSearchParams({
    secret,
    response: token,
  });

  if (remoteIp) {
    body.set("remoteip", remoteIp);
  }

  const response = await fetch(
    "https://challenges.cloudflare.com/turnstile/v0/siteverify",
    {
      method: "POST",
      body,
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      cache: "no-store",
      signal: AbortSignal.timeout(5_000),
    },
  );

  if (!response.ok) {
    throw new Error("Impossible de vérifier le jeton Turnstile.");
  }

  const result = turnstileResponseSchema.safeParse(await response.json());

  if (!result.success) {
    throw new Error("Réponse Turnstile invalide.");
  }

  return result.data.success;
}
