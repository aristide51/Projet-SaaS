import { afterEach, describe, expect, it, vi } from "vitest";

const { createClient, getOptionalUser, logError, revalidatePath } = vi.hoisted(
  () => ({
    createClient: vi.fn(),
    getOptionalUser: vi.fn(),
    logError: vi.fn(),
    revalidatePath: vi.fn(),
  }),
);

vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("@/lib/supabase/server", () => ({ createClient, getOptionalUser }));
vi.mock("@/lib/monitoring/sentry", () => ({ logError }));

import {
  cancelCustomerOrder,
  requestCustomerOrderCancellation,
} from "./customer-actions";

const userId = "00000000-0000-4000-8000-000000000001";
const orderId = "00000000-0000-4000-8000-000000000002";

function createOrderQuery(
  order: { id: string; status: string } | null,
  error: Error | null = null,
) {
  const query = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: order, error }),
  };
  return query;
}

describe("cancelCustomerOrder", () => {
  afterEach(() => vi.clearAllMocks());

  it("rejects malformed order ids before database access", async () => {
    await expect(cancelCustomerOrder({ orderId: "invalid" })).resolves.toEqual({
      success: false,
      message: "Commande invalide.",
    });

    expect(getOptionalUser).not.toHaveBeenCalled();
    expect(createClient).not.toHaveBeenCalled();
  });

  it("requires a verified customer session", async () => {
    getOptionalUser.mockResolvedValue(null);

    await expect(cancelCustomerOrder({ orderId })).resolves.toMatchObject({
      success: false,
      message: "Connecte-toi avec une adresse e-mail confirmée.",
    });
    expect(createClient).not.toHaveBeenCalled();
  });

  it("checks ownership and cancels only a pending-payment order via RPC", async () => {
    const query = createOrderQuery({ id: orderId, status: "pending_payment" });
    const rpc = vi.fn().mockResolvedValue({ error: null });
    getOptionalUser.mockResolvedValue({
      id: userId,
      email_confirmed_at: "2026-10-23T12:00:00.000Z",
    });
    createClient.mockResolvedValue({
      from: vi.fn(() => query),
      rpc,
    });

    await expect(cancelCustomerOrder({ orderId })).resolves.toEqual({
      success: true,
      message: "Commande annulée.",
    });
    expect(query.eq).toHaveBeenCalledWith("customer_id", userId);
    expect(rpc).toHaveBeenCalledWith("transition_order", {
      p_order_id: orderId,
      p_to: "cancelled",
    });
    expect(revalidatePath).toHaveBeenCalledWith("/account");
  });

  it("does not cancel an order once payment has been declared", async () => {
    const query = createOrderQuery({ id: orderId, status: "payment_declared" });
    const rpc = vi.fn();
    getOptionalUser.mockResolvedValue({
      id: userId,
      email_confirmed_at: "2026-10-23T12:00:00.000Z",
    });
    createClient.mockResolvedValue({
      from: vi.fn(() => query),
      rpc,
    });

    await expect(cancelCustomerOrder({ orderId })).resolves.toMatchObject({
      success: false,
      message: expect.stringContaining("ne peut plus être annulée"),
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("does not reveal or mutate an order that is not owned by the customer", async () => {
    const query = createOrderQuery(null);
    const rpc = vi.fn();
    getOptionalUser.mockResolvedValue({
      id: userId,
      email_confirmed_at: "2026-10-23T12:00:00.000Z",
    });
    createClient.mockResolvedValue({
      from: vi.fn(() => query),
      rpc,
    });

    await expect(cancelCustomerOrder({ orderId })).resolves.toEqual({
      success: false,
      message: "Commande introuvable.",
    });
    expect(query.eq).toHaveBeenCalledWith("customer_id", userId);
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("requestCustomerOrderCancellation", () => {
  afterEach(() => vi.clearAllMocks());

  it("submits a validated cancellation request through the RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({ error: null });
    getOptionalUser.mockResolvedValue({
      id: userId,
      email_confirmed_at: "2026-10-23T12:00:00.000Z",
    });
    createClient.mockResolvedValue({ rpc });

    await expect(
      requestCustomerOrderCancellation({
        orderId,
        note: "  Je ne peux plus venir  ",
      }),
    ).resolves.toEqual({
      success: true,
      message: "Demande envoyée à la boutique.",
    });
    expect(rpc).toHaveBeenCalledWith("request_order_cancellation", {
      p_order_id: orderId,
      p_customer_note: "Je ne peux plus venir",
    });
    expect(revalidatePath).toHaveBeenCalledWith("/account");
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard/orders");
  });

  it("rejects malformed input before accessing the session", async () => {
    await expect(
      requestCustomerOrderCancellation({ orderId: "invalid" }),
    ).resolves.toEqual({
      success: false,
      message: "Demande invalide.",
    });
    expect(getOptionalUser).not.toHaveBeenCalled();
  });
});
