import { createClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";

const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const projectUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:55421";
const appOrigin = "http://127.0.0.1:3000";

test("commerçant vérifie un paiement et termine la commande avec chronologie et export", async ({
  page,
}) => {
  test.setTimeout(60_000);
  if (!serviceRoleKey || !anonKey) {
    test.skip(
      true,
      "Ce parcours nécessite SUPABASE_SERVICE_ROLE_KEY et NEXT_PUBLIC_SUPABASE_ANON_KEY.",
    );
    return;
  }

  const admin = createClient(projectUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const email = `orders-${crypto.randomUUID()}@test.invalid`;
  const password = `Order!${crypto.randomUUID().slice(0, 12)}`;
  let userId: string | null = null;
  let shopId: string | null = null;

  try {
    const { data: createdUser, error: userError } =
      await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
    if (userError) throw new Error("Le compte E2E n’a pas pu être créé.");
    userId = createdUser.user.id;

    const { data: shop, error: shopError } = await admin
      .from("shops")
      .insert({
        created_by: userId,
        slug: `commandes-${crypto.randomUUID().slice(0, 8)}`,
        name: "Boutique E2E commandes",
        review_status: "approved",
      })
      .select("id")
      .single();
    if (shopError) throw new Error("La boutique E2E n’a pas pu être créée.");
    shopId = shop.id;

    const { error: memberError } = await admin.from("shop_members").upsert(
      {
        shop_id: shopId,
        user_id: userId,
        role: "owner",
        permissions: {},
      },
      { onConflict: "shop_id,user_id" },
    );
    if (memberError) throw new Error("Le propriétaire E2E n’a pas été créé.");

    const { data: order, error: orderError } = await admin
      .from("orders")
      .insert({
        shop_id: shopId,
        customer_id: userId,
        status: "pending_payment",
        payment_method: "ussd_orange",
        fulfillment: "pickup",
        subtotal: 1500,
        discount: 0,
        total: 1500,
      })
      .select("id, code, created_at")
      .single();
    if (orderError) throw new Error("La commande E2E n’a pas été créée.");

    const customer = createClient(projectUrl, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { error: signInError } = await customer.auth.signInWithPassword({
      email,
      password,
    });
    if (signInError) {
      throw new Error("La session client E2E n’a pas pu être créée.");
    }
    const { error: declarationError } = await customer.rpc("declare_payment", {
      p_order_id: order.id,
      p_payer_phone: "+22670123456",
      p_transaction_ref: `E2E${crypto.randomUUID().slice(0, 12)}`,
    });
    await customer.auth.signOut();
    if (declarationError) {
      throw new Error("La déclaration de paiement E2E n’a pas été créée.");
    }

    const { data: magicLink, error: magicLinkError } =
      await admin.auth.admin.generateLink({
        type: "magiclink",
        email,
        options: {
          redirectTo: `${appOrigin}/auth/callback?next=%2Faccount`,
        },
      });
    if (magicLinkError || !magicLink.properties?.action_link) {
      throw new Error("Le lien de connexion E2E n’a pas pu être créé.");
    }
    await signIn(page, magicLink.properties.action_link);
    await page.goto(`/dashboard/orders?shop=${shopId}`);
    const orderCard = page
      .locator(".orders-card")
      .filter({ hasText: order.code });
    await expect(orderCard).toBeVisible();
    await expect(orderCard).toContainText("1500 FCFA");
    await expect(orderCard).toContainText("+22670123456");
    await expect(orderCard).toContainText("Paiement reçu");

    await orderCard.getByRole("button", { name: "Paiement reçu" }).click();
    await expect(orderCard).toContainText("Payé");
    await orderCard
      .getByRole("button", { name: "Confirmer la commande" })
      .click();
    await expect(orderCard).toContainText("Confirmée");
    await orderCard
      .getByRole("button", { name: "Marquer comme prête" })
      .click();
    await expect(orderCard).toContainText("Prête");
    await orderCard
      .getByRole("button", { name: "Marquer comme terminée" })
      .click();
    await expect(orderCard).toContainText("Terminée");
    await expect(orderCard).toContainText("Paiement déclaré → Payé");
    await expect(orderCard).toContainText("Prête → Terminée");

    const createdDate = new Date(order.created_at).toISOString().slice(0, 10);
    await page.getByLabel("Du").fill(createdDate);
    await page.getByLabel("Au").fill(createdDate);
    await page.getByRole("button", { name: "Filtrer" }).click();
    await expect(page).toHaveURL(/dateFrom=/);

    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Exporter en CSV" }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/^commandes_.*\.csv$/);
  } finally {
    if (shopId) {
      await admin.from("shops").delete().eq("id", shopId);
    }
    if (userId) {
      await admin.auth.admin.deleteUser(userId);
    }
  }
});

test("un employé sans permission commandes ne voit pas les commandes", async ({
  page,
}) => {
  test.setTimeout(60_000);
  if (!serviceRoleKey || !anonKey) {
    test.skip(
      true,
      "Ce parcours nécessite SUPABASE_SERVICE_ROLE_KEY et NEXT_PUBLIC_SUPABASE_ANON_KEY.",
    );
    return;
  }

  const admin = createClient(projectUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const email = `orders-staff-${crypto.randomUUID()}@test.invalid`;
  const password = `Order!${crypto.randomUUID().slice(0, 12)}`;
  let userId: string | null = null;
  let shopId: string | null = null;

  try {
    const { data: createdUser, error: userError } =
      await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
    if (userError) throw new Error("Le compte E2E n’a pas pu être créé.");
    userId = createdUser.user.id;
    const { data: shop, error: shopError } = await admin
      .from("shops")
      .insert({
        created_by: userId,
        slug: `commandes-staff-${crypto.randomUUID().slice(0, 8)}`,
        name: "Boutique E2E accès",
      })
      .select("id")
      .single();
    if (shopError) throw new Error("La boutique E2E n’a pas pu être créée.");
    shopId = shop.id;

    const { error: memberError } = await admin
      .from("shop_members")
      .update({ role: "staff", permissions: {} })
      .eq("shop_id", shopId)
      .eq("user_id", userId);
    if (memberError) throw new Error("L’employé E2E n’a pas été ajouté.");

    const { data: magicLink, error: magicLinkError } =
      await admin.auth.admin.generateLink({
        type: "magiclink",
        email,
        options: {
          redirectTo: `${appOrigin}/auth/callback?next=%2Faccount`,
        },
      });
    if (magicLinkError || !magicLink.properties?.action_link) {
      throw new Error("Le lien de connexion E2E n’a pas pu être créé.");
    }
    await signIn(page, magicLink.properties.action_link);
    await page.goto(`/dashboard/orders?shop=${shopId}`);
    await expect(
      page.getByRole("heading", { name: "Accès refusé" }),
    ).toBeVisible();
    await expect(page.locator(".orders-card")).toHaveCount(0);
  } finally {
    if (shopId) {
      await admin.from("shops").delete().eq("id", shopId);
    }
    if (userId) {
      await admin.auth.admin.deleteUser(userId);
    }
  }
});

async function signIn(page: Page, actionLink: string) {
  await page.goto(actionLink);
  await page.goto("/account");
  await expect(page.getByRole("heading", { name: "Bienvenue" })).toBeVisible();
}
