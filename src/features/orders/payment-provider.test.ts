import { describe, expect, it, vi } from "vitest";
import {
  FakeProvider,
  processProviderWebhook,
  signFakeWebhook,
} from "../../../supabase/functions/_shared/payment-provider";

const webhookSecret = "test-webhook-secret-with-more-than-32-characters";

describe("PaymentProvider fake implementation", () => {
  it("creates an idempotent payment and rechecks its status", async () => {
    const provider = new FakeProvider(webhookSecret);
    const input = {
      amount: 2500,
      currency: "XOF" as const,
      idempotencyKey: "order-42",
      orderCode: "CMD-42",
    };

    const first = await provider.createPayment(input);
    const repeated = await provider.createPayment(input);

    expect(repeated.providerRef).toBe(first.providerRef);
    expect(await provider.getStatus(first.providerRef)).toBe("pending");
    provider.setStatusForTest(first.providerRef, "succeeded");
    expect(await provider.getStatus(first.providerRef)).toBe("succeeded");
  });

  it("rejects an invalid signature before checking the payment status", async () => {
    const provider = new FakeProvider(webhookSecret);
    const getStatus = vi.spyOn(provider, "getStatus");

    await expect(
      provider.verifyWebhook(
        JSON.stringify({ event_id: "evt-1", provider_ref: "fake_ref" }),
        "invalid-signature",
      ),
    ).rejects.toThrow("Invalid webhook signature.");
    expect(getStatus).not.toHaveBeenCalled();
  });

  it("uses the provider's rechecked state rather than the webhook claim", async () => {
    const provider = new FakeProvider(webhookSecret);
    const payment = await provider.createPayment({
      amount: 2500,
      currency: "XOF",
      idempotencyKey: "order-43",
      orderCode: "CMD-43",
    });
    provider.setStatusForTest(payment.providerRef, "pending");
    const rawBody = JSON.stringify({
      event_id: "evt-2",
      provider_ref: payment.providerRef,
      status: "succeeded",
    });
    const recordVerifiedEvent = vi.fn().mockResolvedValue("recorded");

    const result = await processProviderWebhook(
      rawBody,
      await signFakeWebhook(rawBody, webhookSecret),
      provider,
      { recordVerifiedEvent },
    );

    expect(result.status).toBe("pending");
    expect(result.result).toBe("recorded");
    expect(recordVerifiedEvent).toHaveBeenCalledWith(
      { eventId: "evt-2", providerRef: payment.providerRef },
      "pending",
    );
  });

  it("returns the repository's duplicate result for webhook replays", async () => {
    const provider = new FakeProvider(webhookSecret);
    const payment = await provider.createPayment({
      amount: 500,
      currency: "XOF",
      idempotencyKey: "order-44",
      orderCode: "CMD-44",
    });
    const rawBody = JSON.stringify({
      event_id: "evt-3",
      provider_ref: payment.providerRef,
    });

    const result = await processProviderWebhook(
      rawBody,
      await signFakeWebhook(rawBody, webhookSecret),
      provider,
      { recordVerifiedEvent: async () => "duplicate" },
    );

    expect(result.result).toBe("duplicate");
  });
});
