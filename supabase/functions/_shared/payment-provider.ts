export type ProviderPaymentStatus =
  "pending" | "succeeded" | "failed" | "expired" | "refunded";

export type CreatePaymentInput = {
  amount: number;
  currency: "XOF";
  idempotencyKey: string;
  orderCode: string;
};

export type ProviderPayment = {
  providerRef: string;
  checkoutUrl: string;
  status: ProviderPaymentStatus;
};

export type ProviderWebhookEvent = {
  eventId: string;
  providerRef: string;
};

export interface PaymentProvider {
  createPayment(input: CreatePaymentInput): Promise<ProviderPayment>;
  getStatus(providerRef: string): Promise<ProviderPaymentStatus>;
  verifyWebhook(
    rawBody: string,
    signature: string,
  ): Promise<ProviderWebhookEvent>;
  refund(
    providerRef: string,
    amount: number,
  ): Promise<{ providerRef: string; status: "refunded" }>;
}

export type WebhookRepository = {
  recordVerifiedEvent(
    event: ProviderWebhookEvent,
    status: ProviderPaymentStatus,
  ): Promise<"duplicate" | "ignored" | "paid" | "recorded">;
};

export class WebhookValidationError extends Error {}

export async function processProviderWebhook(
  rawBody: string,
  signature: string,
  provider: PaymentProvider,
  repository: WebhookRepository,
) {
  const event = await provider.verifyWebhook(rawBody, signature);
  const verifiedStatus = await provider.getStatus(event.providerRef);
  const result = await repository.recordVerifiedEvent(event, verifiedStatus);
  return { eventId: event.eventId, status: verifiedStatus, result };
}

export class FakeProvider implements PaymentProvider {
  private readonly statuses = new Map<string, ProviderPaymentStatus>();
  private readonly idempotencyRefs = new Map<string, string>();
  private readonly idempotencyInputs = new Map<string, string>();
  private readonly secret: string;

  constructor(secret: string) {
    if (secret.length < 32) {
      throw new Error(
        "FakeProvider requires a webhook secret of 32+ characters.",
      );
    }
    this.secret = secret;
  }

  async createPayment(input: CreatePaymentInput): Promise<ProviderPayment> {
    if (
      !Number.isSafeInteger(input.amount) ||
      input.amount <= 0 ||
      !input.idempotencyKey.trim()
    ) {
      throw new Error("Invalid payment request.");
    }

    const inputFingerprint = JSON.stringify([
      input.amount,
      input.currency,
      input.orderCode,
    ]);
    let providerRef = this.idempotencyRefs.get(input.idempotencyKey);
    if (
      providerRef &&
      this.idempotencyInputs.get(input.idempotencyKey) !== inputFingerprint
    ) {
      throw new Error(
        "Idempotency key was reused with different payment data.",
      );
    }
    if (!providerRef) {
      providerRef = `fake_${await sha256(input.idempotencyKey)}`;
      this.idempotencyRefs.set(input.idempotencyKey, providerRef);
      this.idempotencyInputs.set(input.idempotencyKey, inputFingerprint);
      this.statuses.set(providerRef, "pending");
    }
    return {
      providerRef,
      checkoutUrl: `fake://checkout/${providerRef}`,
      status: this.statuses.get(providerRef) ?? "pending",
    };
  }

  async getStatus(providerRef: string): Promise<ProviderPaymentStatus> {
    const status = this.statuses.get(providerRef);
    if (!status) throw new Error("Unknown fake payment.");
    return status;
  }

  async verifyWebhook(
    rawBody: string,
    signature: string,
  ): Promise<ProviderWebhookEvent> {
    if (!(await verifyHmac(rawBody, signature, this.secret))) {
      throw new WebhookValidationError("Invalid webhook signature.");
    }
    let value: unknown;
    try {
      value = JSON.parse(rawBody);
    } catch {
      throw new WebhookValidationError("Invalid webhook payload.");
    }
    if (!isRecord(value)) {
      throw new WebhookValidationError("Invalid webhook payload.");
    }
    const { event_id: eventId, provider_ref: providerRef } = value;
    if (
      typeof eventId !== "string" ||
      !/^[A-Za-z0-9._:-]{1,160}$/.test(eventId) ||
      typeof providerRef !== "string" ||
      !/^fake_[a-f0-9]{64}$/.test(providerRef)
    ) {
      throw new WebhookValidationError("Invalid webhook payload.");
    }
    return { eventId, providerRef };
  }

  async refund(providerRef: string, amount: number) {
    if (!Number.isSafeInteger(amount) || amount <= 0) {
      throw new Error("Invalid refund amount.");
    }
    const status = await this.getStatus(providerRef);
    if (status !== "succeeded") {
      throw new Error("Only a succeeded payment can be refunded.");
    }
    this.statuses.set(providerRef, "refunded");
    return { providerRef, status: "refunded" as const };
  }

  setStatusForTest(providerRef: string, status: ProviderPaymentStatus) {
    if (!this.statuses.has(providerRef)) {
      throw new Error("Unknown fake payment.");
    }
    this.statuses.set(providerRef, status);
  }
}

export async function signFakeWebhook(rawBody: string, secret: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(rawBody),
  );
  return toHex(new Uint8Array(signature));
}

async function verifyHmac(rawBody: string, signature: string, secret: string) {
  if (!/^[a-f0-9]{64}$/i.test(signature)) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  return crypto.subtle.verify(
    "HMAC",
    key,
    fromHex(signature),
    new TextEncoder().encode(rawBody),
  );
}

async function sha256(value: string) {
  const hash = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return toHex(new Uint8Array(hash));
}

function toHex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}

function fromHex(value: string) {
  return Uint8Array.from(value.match(/.{2}/g) ?? [], (byte) =>
    Number.parseInt(byte, 16),
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
