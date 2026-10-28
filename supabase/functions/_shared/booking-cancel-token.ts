export type BookingCancelTokenPayload = {
  booking_id: string;
  reminder_stage: "24_hours" | "2_hours";
  expires_at: string;
};

function encode(value: Uint8Array) {
  return btoa(String.fromCharCode(...value))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}

function decode(value: string) {
  const base64 = value.replaceAll("-", "+").replaceAll("_", "/");
  return Uint8Array.from(
    atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "=")),
    (character) => character.charCodeAt(0),
  );
}

async function getKey(secret: string, usages: KeyUsage[]) {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    usages,
  );
}

export async function signBookingCancelToken(
  payload: BookingCancelTokenPayload,
  secret: string,
) {
  const encodedPayload = encode(
    new TextEncoder().encode(JSON.stringify(payload)),
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    await getKey(secret, ["sign"]),
    new TextEncoder().encode(encodedPayload),
  );
  return `${encodedPayload}.${encode(new Uint8Array(signature))}`;
}

export async function verifyBookingCancelToken(
  token: string,
  secret: string,
): Promise<BookingCancelTokenPayload | null> {
  const [encodedPayload, encodedSignature, extra] = token.split(".");
  if (!encodedPayload || !encodedSignature || extra) return null;

  try {
    const valid = await crypto.subtle.verify(
      "HMAC",
      await getKey(secret, ["verify"]),
      decode(encodedSignature),
      new TextEncoder().encode(encodedPayload),
    );
    if (!valid) return null;

    const payload: unknown = JSON.parse(
      new TextDecoder().decode(decode(encodedPayload)),
    );
    if (
      typeof payload !== "object" ||
      payload === null ||
      !("booking_id" in payload) ||
      !("reminder_stage" in payload) ||
      !("expires_at" in payload) ||
      typeof payload.booking_id !== "string" ||
      (payload.reminder_stage !== "24_hours" &&
        payload.reminder_stage !== "2_hours") ||
      typeof payload.expires_at !== "string" ||
      !Number.isFinite(Date.parse(payload.expires_at)) ||
      Date.parse(payload.expires_at) <= Date.now()
    ) {
      return null;
    }

    return payload as BookingCancelTokenPayload;
  } catch {
    return null;
  }
}
