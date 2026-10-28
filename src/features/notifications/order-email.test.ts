import { describe, expect, it, vi } from "vitest";
import {
  buildOrderEmail,
  sendOrderEmail,
} from "../../../supabase/functions/_shared/order-email";

describe("order notification email", () => {
  const unsubscribeUrl =
    "https://example.test/functions/v1/notify?action=unsubscribe&token=signed";

  it("renders supported transactional statuses without payment data", () => {
    const email = buildOrderEmail(
      "order_status",
      {
        code: "CMD-1234",
        status: "payment_declared",
        transaction_ref: "MUST-NOT-APPEAR",
        payer_phone: "+22670000000",
      },
      "Boutique de Awa",
      unsubscribeUrl,
    );

    expect(email?.subject).toContain("Paiement déclaré");
    expect(email?.text).toContain("CMD-1234");
    expect(email?.text).not.toContain("MUST-NOT-APPEAR");
    expect(email?.text).not.toContain("+22670000000");
    expect(email?.html).toContain("Se désinscrire des e-mails non essentiels");
  });

  it("escapes user-controlled content and ignores unsupported notification types", () => {
    const email = buildOrderEmail(
      "order_received",
      { code: "<img src=x onerror=alert(1)>" },
      "<Boutique>",
      unsubscribeUrl,
    );

    expect(email?.html).not.toContain("<img");
    expect(email?.html).toContain("&lt;Boutique&gt;");
    expect(
      buildOrderEmail("shop_review", {}, "Boutique", unsubscribeUrl),
    ).toBeNull();
  });

  it("renders subscription reminders without payment details", () => {
    const email = buildOrderEmail(
      "subscription_reminder",
      {
        shop_id: "50000000-0000-0000-0000-000000000001",
        reminder_key: "7_days",
        payment_ref: "MUST-NOT-APPEAR",
      },
      "Boutique de Awa",
      unsubscribeUrl,
    );

    expect(email?.subject).toContain("dans 7 jours");
    expect(email?.text).toContain("Boutique de Awa");
    expect(email?.text).not.toContain("MUST-NOT-APPEAR");
    const dueEmail = buildOrderEmail(
      "subscription_reminder",
      { reminder_key: "due" },
      "Boutique de Awa",
      unsubscribeUrl,
    );
    expect(dueEmail?.text).toContain("est arrivé à échéance");
    expect(
      buildOrderEmail(
        "subscription_reminder",
        { reminder_key: "unknown" },
        "Boutique",
        unsubscribeUrl,
      ),
    ).toBeNull();
  });

  it("adds a confirmation link to booking reminders without exposing payment data", () => {
    const email = buildOrderEmail(
      "booking_reminder",
      {
        reminder_stage: "24_hours",
        appointment_at: "2026-12-01T09:00:00.000Z",
        service_name: "Coupe",
        cancel_url: "https://example.test/booking-cancel?token=signed",
        payer_phone: "+22670000000",
      },
      "Salon Awa",
      unsubscribeUrl,
    );

    expect(email?.subject).toContain("demain");
    expect(email?.text).toContain("Coupe chez Salon Awa");
    expect(email?.text).toContain("https://example.test/booking-cancel?token=signed");
    expect(email?.text).not.toContain("+22670000000");
    expect(email?.html).toContain("Gérer l’annulation du rendez-vous");
  });

  it("uses the injected transport and propagates transport failures", async () => {
    const content = buildOrderEmail(
      "order_received",
      { code: "CMD-1234" },
      "Boutique",
      unsubscribeUrl,
    );
    if (!content) throw new Error("Expected an order email.");
    const transport = vi.fn().mockResolvedValue(undefined);

    await sendOrderEmail(
      {
        ...content,
        to: "client@example.test",
        from: "boutique@example.test",
        idempotencyKey: "notification-job-id",
      },
      transport,
    );
    expect(transport).toHaveBeenCalledOnce();

    const failedTransport = vi
      .fn()
      .mockRejectedValue(new Error("Transport unavailable"));
    await expect(
      sendOrderEmail(
        {
          ...content,
          to: "client@example.test",
          from: "boutique@example.test",
          idempotencyKey: "notification-job-id",
        },
        failedTransport,
      ),
    ).rejects.toThrow("Transport unavailable");
  });
});
