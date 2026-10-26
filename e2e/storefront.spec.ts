import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";

const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const projectUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:55421";
const privateCatalogSentinel = "INTERNAL-SKU-MUST-NOT-REACH-STOREFRONT";

test("la vitrine ne rend pas les produits privés ni les champs internes", async ({
  page,
}) => {
  if (!serviceRoleKey) {
    test.skip(true, "Ce test nécessite SUPABASE_SERVICE_ROLE_KEY local.");
    return;
  }

  const admin = createClient(projectUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
  const email = `${crypto.randomUUID()}@test.invalid`;
  const slug = `vitrine-e2e-${crypto.randomUUID().slice(0, 8)}`;
  let userId: string | null = null;
  let shopId: string | null = null;

  try {
    const { data: userResult, error: userError } =
      await admin.auth.admin.createUser({
        email,
        email_confirm: true,
      });
    if (userError) throw new Error("Le compte de test n’a pas pu être créé.");
    userId = userResult.user.id;

    const { data: shop, error: shopError } = await admin
      .from("shops")
      .insert({
        created_by: userId,
        slug,
        name: "Boutique E2E privée",
        review_status: "approved",
      })
      .select("id")
      .single();
    if (shopError) throw new Error("La boutique E2E n’a pas pu être créée.");
    shopId = shop.id;

    const { error: productsError } = await admin.from("products").insert([
      {
        shop_id: shopId,
        name: "Produit public E2E",
        description: "Article visible",
        price: 4000,
        status: "available",
        sku: privateCatalogSentinel,
        compatibility: "DONNEE-INTERNE-E2E",
        stock: 987654321,
        is_sample: false,
        deleted_at: null,
      },
      {
        shop_id: shopId,
        name: "Produit masqué E2E",
        price: 5000,
        status: "hidden",
        sku: null,
        compatibility: null,
        stock: null,
        is_sample: false,
        deleted_at: null,
      },
      {
        shop_id: shopId,
        name: "Produit supprimé E2E",
        price: 6000,
        status: "available",
        sku: null,
        compatibility: null,
        stock: null,
        is_sample: false,
        deleted_at: new Date().toISOString(),
      },
      {
        shop_id: shopId,
        name: "Exemple E2E",
        price: 7000,
        status: "available",
        sku: null,
        compatibility: null,
        stock: null,
        is_sample: true,
        deleted_at: null,
      },
    ]);
    if (productsError) {
      throw new Error("Les produits de test n’ont pas pu être créés.");
    }

    const { data: publicProduct, error: publicProductError } = await admin
      .from("products")
      .select("id")
      .eq("shop_id", shopId)
      .eq("name", "Produit public E2E")
      .single();
    if (publicProductError) {
      throw new Error("Le produit public E2E n’a pas pu être retrouvé.");
    }

    const { data: variant, error: variantError } = await admin
      .from("product_variants")
      .insert({
        shop_id: shopId,
        product_id: publicProduct.id,
        name: "Grande",
        price: 4500,
        stock: 5,
      })
      .select("id")
      .single();
    if (variantError || !variant) {
      throw new Error("La variante E2E n’a pas pu être créée.");
    }

    const network = await page.context().newCDPSession(page);
    await network.send("Network.enable");
    await network.send("Network.emulateNetworkConditions", {
      offline: false,
      latency: 150,
      downloadThroughput: (1.6 * 1024 * 1024) / 8,
      uploadThroughput: (750 * 1024) / 8,
      connectionType: "cellular4g",
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.addInitScript(() => {
      const observer = new PerformanceObserver((entries) => {
        const latest = entries.getEntries().at(-1);
        if (latest) {
          (window as Window & { storefrontLcp?: number }).storefrontLcp =
            latest.startTime;
        }
      });
      observer.observe({ type: "largest-contentful-paint", buffered: true });
    });

    await page.goto(`/${slug}`);
    await expect(
      page.getByRole("heading", { name: "Boutique E2E privée" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Produit public E2E" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Produit masqué E2E" }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("heading", { name: "Produit supprimé E2E" }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("heading", { name: "Exemple E2E" }),
    ).toHaveCount(0);

    const html = await page.locator("main").innerHTML();
    expect(html).not.toContain(privateCatalogSentinel);
    expect(html).not.toContain("DONNEE-INTERNE-E2E");
    expect(html).not.toContain("987654321");
    await expect
      .poll(() =>
        page.evaluate(
          () => (window as Window & { storefrontLcp?: number }).storefrontLcp,
        ),
      )
      .toBeGreaterThan(0);
    const lcp = await page.evaluate(
      () => (window as Window & { storefrontLcp?: number }).storefrontLcp,
    );
    expect(lcp).toBeLessThan(2500);
    await network.detach();

    await page.getByRole("link", { name: "Voir Produit public E2E" }).click();
    const addButton = page.getByRole("button", {
      name: "Ajouter au panier",
    });
    await expect(addButton).toBeDisabled();
    await page.getByLabel("Choisis une variante").selectOption(variant.id);
    await expect(addButton).toBeEnabled();
    await addButton.click();
    await expect(page.getByRole("button", { name: "Panier (1)" })).toBeVisible();
    await page.getByRole("button", { name: "Panier (1)" }).click();
    const cart = page.getByRole("region", {
      name: "Panier chez Boutique E2E privée",
    });
    await expect(cart.getByText("Grande")).toBeVisible();

    await page.reload();
    await expect(page.getByRole("button", { name: "Panier (1)" })).toBeVisible();
    await page.getByRole("button", { name: "Panier (1)" }).click();
    const persistedCart = page.getByRole("region", {
      name: "Panier chez Boutique E2E privée",
    });
    await persistedCart
      .getByRole("button", { name: "Augmenter Produit public E2E" })
      .click();
    await expect(persistedCart.getByText("2", { exact: true })).toBeVisible();
    await persistedCart.getByRole("button", { name: "Retirer" }).click();
    await expect(persistedCart.getByText(/Ton panier est vide/)).toBeVisible();
  } finally {
    if (shopId) {
      const { error } = await admin.from("shops").delete().eq("id", shopId);
      if (error) throw new Error("La boutique E2E n’a pas pu être nettoyée.");
    }
    if (userId) {
      const { error } = await admin.auth.admin.deleteUser(userId);
      if (error) throw new Error("Le compte E2E n’a pas pu être nettoyé.");
    }
  }
});
