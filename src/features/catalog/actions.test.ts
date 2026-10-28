import { afterEach, describe, expect, it, vi } from "vitest";

const { createClient, getUser, revalidatePublicShop } = vi.hoisted(() => ({
  createClient: vi.fn(),
  getUser: vi.fn(),
  revalidatePublicShop: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient,
  getUser,
}));

vi.mock("@/lib/monitoring/sentry", () => ({
  logError: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/features/storefront/cache", () => ({
  revalidatePublicShop,
}));

import { saveProduct } from "./actions";

const shopId = "10000000-0000-4000-8000-000000000001";
const productId = "20000000-0000-4000-8000-000000000001";
const validProduct = {
  id: null,
  categoryId: null,
  name: "Pneu",
  description: "",
  price: 12000,
  compareAtPrice: null,
  sku: "",
  compatibility: "",
  stock: null,
  status: "available",
  variants: [],
};

function configureAccess(
  member: {
    role: "owner" | "staff";
    permissions: Record<string, boolean>;
  } | null,
  rpcResult: {
    data: string | null;
    error: { message: string; code: string } | null;
  } = { data: productId, error: null },
  productLimitResult: {
    data: number | null;
    error: { message: string; code: string } | null;
  } = { data: 15, error: null },
) {
  const membershipQuery = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: member, error: null }),
  };
  const variantsQuery = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockResolvedValue({ data: [], error: null }),
  };
  const supabase = {
    from: vi.fn((table: string) =>
      table === "shop_members" ? membershipQuery : variantsQuery,
    ),
    rpc: vi.fn((name: string) =>
      Promise.resolve(
        name === "catalog_product_limit" ? productLimitResult : rpcResult,
      ),
    ),
  };
  getUser.mockResolvedValue({
    id: "30000000-0000-4000-8000-000000000001",
    email_confirmed_at: "2026-01-01T00:00:00.000Z",
  });
  createClient.mockResolvedValue(supabase);
  return supabase;
}

describe("catalog server actions", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("rejects invalid product data before contacting Supabase", async () => {
    const result = await saveProduct(shopId, { ...validProduct, price: 1.5 });

    expect(result).toEqual({
      success: false,
      message: "Vérifie le nom, le prix, le stock et les variantes.",
    });
    expect(createClient).not.toHaveBeenCalled();
  });

  it("refuses a staff member without catalog permission", async () => {
    const supabase = configureAccess({
      role: "staff",
      permissions: { orders: true },
    });

    const result = await saveProduct(shopId, validProduct);

    expect(result).toMatchObject({ success: false });
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it("saves product prices through the database RPC", async () => {
    const supabase = configureAccess({ role: "owner", permissions: {} });

    const result = await saveProduct(shopId, validProduct);

    expect(result).toMatchObject({
      success: true,
      id: productId,
      message: "Produit ajouté.",
    });
    expect(supabase.rpc).toHaveBeenCalledWith("save_catalog_product", {
      p_shop: shopId,
      p_product: {
        id: null,
        category_id: null,
        name: "Pneu",
        description: "",
        price: 12000,
        compare_at_price: null,
        sku: "",
        compatibility: "",
        stock: null,
        status: "available",
        variants: [],
      },
    });
    expect(revalidatePublicShop).toHaveBeenCalledWith(shopId);
  });

  it("returns the plan-limit message from the database constraint", async () => {
    const supabase = configureAccess(
      { role: "owner", permissions: {} },
      { data: null, error: { message: "plan_limit_products", code: "P0001" } },
      { data: 40, error: null },
    );

    await expect(saveProduct(shopId, validProduct)).resolves.toMatchObject({
      success: false,
      message: expect.stringContaining("40 produits"),
    });
    expect(supabase.rpc).toHaveBeenCalledWith("catalog_product_limit", {
      p_shop: shopId,
    });
  });
});
