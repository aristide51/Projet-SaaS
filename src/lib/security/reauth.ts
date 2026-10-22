import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

export const REAUTH_COOKIE_NAME = "reauth_proof";
export const REAUTH_WINDOW_SECONDS = 10 * 60;
const REAUTH_WINDOW_MS = REAUTH_WINDOW_SECONDS * 1000;
const REAUTH_PENDING_COOKIE_NAME = "reauth_pending";

type ReauthPayload = {
  userId: string;
  issuedAt: number;
  expiresAt: number;
};

function getSecret() {
  const secret = process.env.REAUTH_COOKIE_SECRET;

  if (!secret || secret.length < 32) {
    throw new Error(
      "REAUTH_COOKIE_SECRET doit contenir au moins 32 caractères.",
    );
  }

  return secret;
}

export function isReauthConfigured() {
  return Boolean(
    process.env.REAUTH_COOKIE_SECRET &&
    process.env.REAUTH_COOKIE_SECRET.length >= 32,
  );
}

function sign(payload: string, secret: string) {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function createReauthProof(
  userId: string,
  secret: string,
  now = Date.now(),
) {
  const payload = Buffer.from(
    JSON.stringify({
      userId,
      issuedAt: now,
      expiresAt: now + REAUTH_WINDOW_MS,
    } satisfies ReauthPayload),
  ).toString("base64url");

  return `${payload}.${sign(payload, secret)}`;
}

export function isValidReauthProof(
  value: string | undefined,
  userId: string,
  secret: string,
  now = Date.now(),
) {
  if (!value) {
    return false;
  }

  const [encodedPayload, signature, extra] = value.split(".");

  if (!encodedPayload || !signature || extra !== undefined) {
    return false;
  }

  const expectedSignature = sign(encodedPayload, secret);
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);

  if (
    actualBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(actualBuffer, expectedBuffer)
  ) {
    return false;
  }

  try {
    const payload = JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString("utf8"),
    ) as Partial<ReauthPayload>;

    return (
      payload.userId === userId &&
      typeof payload.issuedAt === "number" &&
      typeof payload.expiresAt === "number" &&
      payload.issuedAt <= now &&
      payload.expiresAt > now &&
      payload.expiresAt - payload.issuedAt === REAUTH_WINDOW_MS
    );
  } catch {
    return false;
  }
}

export async function setReauthProof(userId: string) {
  const cookieStore = await cookies();

  cookieStore.set(
    REAUTH_COOKIE_NAME,
    createReauthProof(userId, getSecret()),
    getCookieOptions(),
  );
}

export async function setReauthPending() {
  const cookieStore = await cookies();

  cookieStore.set(
    REAUTH_PENDING_COOKIE_NAME,
    createReauthProof("pending", getSecret()),
    getCookieOptions(),
  );
}

export async function consumeReauthPending() {
  const cookieStore = await cookies();
  const pending = isValidReauthProof(
    cookieStore.get(REAUTH_PENDING_COOKIE_NAME)?.value,
    "pending",
    getSecret(),
  );

  cookieStore.delete(REAUTH_PENDING_COOKIE_NAME);
  return pending;
}

export async function hasRecentReauthentication(userId: string) {
  if (!isReauthConfigured()) {
    return false;
  }

  const cookieStore = await cookies();

  return isValidReauthProof(
    cookieStore.get(REAUTH_COOKIE_NAME)?.value,
    userId,
    getSecret(),
  );
}

export async function clearReauthProof() {
  const cookieStore = await cookies();
  cookieStore.delete(REAUTH_COOKIE_NAME);
}

export async function clearReauthPending() {
  const cookieStore = await cookies();
  cookieStore.delete(REAUTH_PENDING_COOKIE_NAME);
}

function getCookieOptions() {
  return {
    httpOnly: true,
    maxAge: REAUTH_WINDOW_SECONDS,
    path: "/",
    sameSite: "lax" as const,
    secure: process.env.NEXT_PUBLIC_SUPABASE_URL?.startsWith("https://"),
  };
}
