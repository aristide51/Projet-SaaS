import { afterEach, describe, expect, it, vi } from "vitest";

const {
  createClient,
  requireAdminUser,
  logError,
  revalidatePath,
  expirePublicShopIndex,
  revalidatePublicShop,
} = vi.hoisted(() => ({
  createClient: vi.fn(),
  requireAdminUser: vi.fn(),
  logError: vi.fn(),
  revalidatePath: vi.fn(),
  expirePublicShopIndex: vi.fn(),
  revalidatePublicShop: vi.fn(),
}));

vi.mock("@/lib/auth/guards", () => ({ requireAdminUser }));
vi.mock("@/lib/supabase/server", () => ({ createClient }));
vi.mock("@/lib/monitoring/sentry", () => ({ logError }));
vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("@/features/storefront/cache", () => ({
  expirePublicShopIndex,
  revalidatePublicShop,
}));

import { decideShopReview } from "./actions";

const shopId = "00000000-0000-4000-8000-000000000001";
const checklist = {
  identity: true,
  logo: true,
  photos: true,
  contact: true,
  catalog: true,
  terms: true,
};

describe("admin shop review actions", () => {
  afterEach(() => vi.clearAllMocks());

  it("requires every review control before approving", async () => {
    const result = await decideShopReview({
      shopId,
      approve: true,
      reason: "",
    });

    expect(result).toEqual({
      success: false,
      message: "Confirme chaque point de contrôle avant l’approbation.",
    });
    expect(requireAdminUser).not.toHaveBeenCalled();
    expect(createClient).not.toHaveBeenCalled();
  });

  it("requires a reason before rejecting", async () => {
    const result = await decideShopReview({
      shopId,
      approve: false,
      reason: "  ",
    });

    expect(result).toMatchObject({
      success: false,
      message: "Le motif de refus est obligatoire.",
    });
    expect(createClient).not.toHaveBeenCalled();
  });

  it("reports email failure without misreporting the saved database decision", async () => {
    const rpc = vi.fn().mockResolvedValue({ error: null });
    const invoke = vi.fn().mockResolvedValue({
      error: new Error("mail service unavailable"),
    });
    createClient.mockResolvedValue({
      rpc,
      functions: { invoke },
    });
    requireAdminUser.mockResolvedValue({ id: "admin-1" });

    const result = await decideShopReview({
      shopId,
      approve: true,
      reason: "",
      checklist,
    });

    expect(rpc).toHaveBeenCalledWith("review_shop", {
      p_shop: shopId,
      p_approve: true,
    });
    expect(expirePublicShopIndex).toHaveBeenCalledOnce();
    expect(revalidatePublicShop).toHaveBeenCalledWith(shopId);
    expect(invoke).toHaveBeenCalledWith("send-shop-review-decision", {
      body: { shopId, approved: true, reason: null },
    });
    expect(result).toEqual({
      success: true,
      message:
        "Décision enregistrée et notification dans le tableau de bord. L’e-mail n’a pas pu être envoyé.",
      refresh: false,
    });
    expect(logError).toHaveBeenCalledWith(
      "admin_shop_review_email_failed",
      expect.any(Error),
    );
  });
});
