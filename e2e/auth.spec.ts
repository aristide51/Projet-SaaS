import {
  expect,
  test,
  type APIRequestContext,
  type Page,
} from "@playwright/test";

const mailpitUrl = "http://127.0.0.1:55424";

test.beforeEach(async ({ page }) => {
  await mockTurnstile(page);
});

test("inscription confirmée, connexion et absence de jeton dans le stockage navigateur", async ({
  page,
  request,
  context,
}) => {
  test.setTimeout(120_000);
  const email = uniqueEmail();
  const password = "Burkina!2026Auth";

  await registerAndConfirm(page, request, email, password);
  await expect(page).toHaveURL(/\/account$/);
  await expect(page.getByRole("heading", { name: "Bienvenue" })).toBeVisible();
  await page.getByRole("button", { name: "Notifications" }).click();
  await expect(
    page.getByRole("region", { name: "Centre de notifications" }),
  ).toContainText("Tu n’as pas encore de notification.");

  const storedAuthKeys = await page.evaluate(() =>
    Object.keys(localStorage).filter((key) => /auth|token|supabase/i.test(key)),
  );
  expect(storedAuthKeys).toEqual([]);

  const authCookies = (await context.cookies()).filter((cookie) =>
    cookie.name.includes("auth-token"),
  );
  expect(authCookies.length).toBeGreaterThan(0);
  expect(authCookies.every((cookie) => cookie.httpOnly)).toBe(true);

  await page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("boutiques-locales-private-v2", 1);
      request.onupgradeneeded = () => {
        request.result.createObjectStore("snapshots", { keyPath: "key" });
        request.result.createObjectStore("keys", { keyPath: "key" });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const transaction = database.transaction(
      ["snapshots", "keys"],
      "readwrite",
    );
    transaction.objectStore("snapshots").put({
      key: "private-test:orders",
      userId: "private-test",
      kind: "orders",
      ciphertext: new ArrayBuffer(8),
    });
    transaction.objectStore("keys").put({
      key: "private-test",
      cryptoKey: null,
    });
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
    database.close();
    localStorage.setItem("boutiques-locales-private-user", "private-test");
  });

  await page.getByRole("button", { name: "Se déconnecter" }).click();
  await expect(page).toHaveURL(/\/auth\/login$/, { timeout: 15_000 });
  const privateDataCounts = await page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("boutiques-locales-private-v2", 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const transaction = database.transaction(["snapshots", "keys"], "readonly");
    const counts = await Promise.all([
      new Promise<number>((resolve, reject) => {
        const request = transaction.objectStore("snapshots").count();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      }),
      new Promise<number>((resolve, reject) => {
        const request = transaction.objectStore("keys").count();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      }),
    ]);
    database.close();
    return {
      counts,
      activeUser: localStorage.getItem("boutiques-locales-private-user"),
    };
  });
  expect(privateDataCounts.counts).toEqual([0, 0]);
  expect(privateDataCounts.activeUser).toBeNull();

  await page.getByLabel("Adresse e-mail").fill(email);
  await page.getByLabel("Mot de passe").fill(password);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page).toHaveURL(/\/account$/, { timeout: 15_000 });
});

test("un lien magique mocké connecte un compte existant", async ({
  page,
  request,
}) => {
  test.setTimeout(120_000);
  const email = uniqueEmail();

  await registerAndConfirm(page, request, email, "Burkina!2026Magic");
  await page.getByRole("button", { name: "Se déconnecter" }).click();
  await expect(page).toHaveURL(/\/auth\/login$/, { timeout: 15_000 });

  await page.goto("/auth/magic-link");
  await page.getByLabel("Adresse e-mail").fill(email);
  await page.getByRole("button", { name: "M’envoyer un lien" }).click();
  await expect(page.getByRole("status")).toContainText(
    "un lien de connexion vient d’être envoyé",
  );

  const link = await getEmailLink(request, email, "magiclink");
  await openAuthLink(page, link);
  await expect(page).toHaveURL(/\/account$/, { timeout: 15_000 });
  await expect(page.getByRole("heading", { name: "Bienvenue" })).toBeVisible();
});

test("profil : normalisation du téléphone et demande de suppression", async ({
  page,
  request,
}) => {
  test.setTimeout(180_000);
  await registerAndConfirm(page, request, uniqueEmail(), "Burkina!2026Profile");

  const profileForm = page.getByRole("form", { name: "Modifier mon profil" });
  await profileForm.getByLabel("Nom complet").fill("Awa Profil");
  await profileForm.getByLabel("Téléphone").fill("70 12 34 56");
  await profileForm
    .getByRole("button", { name: "Enregistrer mon profil" })
    .click();
  await expect(profileForm.getByRole("status")).toContainText(
    "Profil enregistré.",
    { timeout: 15_000 },
  );
  await expect(profileForm.getByLabel("Téléphone")).toHaveValue("+22670123456");

  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Demander la suppression" }).click();
  await expect(
    page
      .getByRole("region", { name: "Supprimer mon compte" })
      .getByRole("status"),
  ).toContainText("Ta demande est enregistrée.", { timeout: 15_000 });
});

test("ajout d’un produit avec photo convertie en WebP", async ({
  page,
  request,
}) => {
  test.setTimeout(180_000);
  await registerAndConfirm(page, request, uniqueEmail(), "Burkina!2026Catalog");

  await page.goto("/dashboard/onboarding");
  await page.getByRole("button", { name: "Commencer" }).click();
  await expect(page).toHaveURL(/\/dashboard\/onboarding\?shop=[\da-f-]+$/);
  await page.goto("/dashboard/catalog");

  const productForm = page
    .locator("form")
    .filter({ has: page.getByLabel("Nom du produit") });
  await productForm.getByLabel("Nom du produit").fill("Test pneu catalogue");
  await productForm.getByLabel("Prix (FCFA)").fill("12500");
  const pngDataUrl = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 2;
    canvas.height = 2;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas indisponible dans le test.");
    context.fillStyle = "#155d42";
    context.fillRect(0, 0, 2, 2);
    return canvas.toDataURL("image/png").split(",")[1];
  });
  await productForm.getByLabel(/Photos/).setInputFiles({
    name: "test-catalogue.png",
    mimeType: "image/png",
    buffer: Buffer.from(pngDataUrl ?? "", "base64"),
  });
  await page.getByRole("button", { name: "Ajouter le produit" }).click();

  await expect(page.getByRole("status")).toContainText("Images ajoutées.", {
    timeout: 20_000,
  });
  const product = page
    .getByRole("listitem")
    .filter({ hasText: "Test pneu catalogue" });
  await expect(product).toBeVisible();
  await expect(product.locator("img")).toBeVisible();
});

test("aperçu CSV de 500 lignes et exemples publiables après modification", async ({
  page,
  request,
}) => {
  test.setTimeout(240_000);
  await registerAndConfirm(page, request, uniqueEmail(), "Burkina!2026Samples");

  await page.goto("/dashboard/onboarding");
  await page.getByRole("button", { name: "Commencer" }).click();
  await expect(page).toHaveURL(/\/dashboard\/onboarding\?shop=[\da-f-]+$/);
  const shopId = new URL(page.url()).searchParams.get("shop");
  if (!shopId) throw new Error("La boutique de test n’a pas été créée.");

  await page.goto(`/dashboard/catalog/import?shop=${shopId}`);
  const csv = [
    "name,price",
    ...Array.from({ length: 500 }, (_, index) => `Produit ${index + 1},1000`),
  ].join("\n");
  await page.locator('input[type="file"]').setInputFiles({
    name: "catalogue-500.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csv),
  });
  await page.getByRole("button", { name: "Aperçu des lignes" }).click();
  await expect(
    page.getByText("500 ligne(s) valide(s)", { exact: true }),
  ).toBeVisible({ timeout: 15_000 });

  await page.goto(`/dashboard/catalog?shop=${shopId}`);
  await page.getByLabel("Type de commerce").selectOption("garage");
  await page.getByRole("button", { name: "Ajouter les exemples" }).click();
  await expect(page.getByRole("status")).toContainText("Exemples ajoutés.", {
    timeout: 20_000,
  });

  const sampleProduct = page
    .getByRole("listitem")
    .filter({ hasText: "Pneu 175/65 R14" });
  await expect(sampleProduct.getByText("Exemple")).toBeVisible();
  await sampleProduct.getByRole("button", { name: "Modifier" }).click();
  const productForm = page
    .locator("form")
    .filter({ has: page.getByLabel("Nom du produit") });
  await productForm
    .getByLabel("Nom du produit")
    .fill("Pneu 175/65 R14 modifié");
  await productForm
    .getByRole("button", { name: "Enregistrer le produit" })
    .click();
  await expect(page.getByRole("status")).toContainText("Produit mis à jour.", {
    timeout: 20_000,
  });

  const editedProduct = page
    .getByRole("listitem")
    .filter({ hasText: "Pneu 175/65 R14 modifié" });
  await expect(editedProduct).toBeVisible();
  await expect(editedProduct.getByText("Exemple")).toHaveCount(0);
});

test("parcours commerçant en huit étapes jusqu’à la soumission", async ({
  page,
  request,
}) => {
  test.setTimeout(540_000);
  const startedAt = Date.now();
  await registerAndConfirm(
    page,
    request,
    uniqueEmail(),
    "Burkina!2026Onboarding",
  );

  await page.goto("/dashboard/onboarding");
  await page.getByRole("button", { name: "Commencer" }).click();
  await expect(page).toHaveURL(/\/dashboard\/onboarding\?shop=[\da-f-]+$/, {
    timeout: 30_000,
  });
  const shopId = new URL(page.url()).searchParams.get("shop");
  if (!shopId) throw new Error("La boutique de test n’a pas été créée.");
  const shopSlug = `quincaillerie-${shopId.slice(0, 8)}`;

  await page.getByRole("button", { name: "Quincaillerie" }).click();
  await page.getByRole("button", { name: "Continuer" }).click();
  await page.getByLabel("Nom de la boutique").fill("Quincaillerie E2E");
  await page.getByLabel("Adresse de la boutique").fill(shopSlug);
  await expect(
    page
      .getByRole("region", { name: "Donne une identité à ta boutique" })
      .getByRole("status"),
  ).toContainText("Adresse disponible.", { timeout: 15_000 });
  await page.getByRole("button", { name: "Continuer" }).click();
  await page.getByLabel("WhatsApp").fill("+22670123456");
  await page.getByLabel("Téléphone du commerce").fill("+22670123456");
  await page.getByLabel("Ville").fill("Ouagadougou");
  await page.getByLabel("Quartier").fill("Koulouba");
  await page.getByRole("button", { name: "Continuer" }).click();
  await page
    .getByRole("button", { name: "Enregistrer et terminer cette partie" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Ajoute tes premiers articles" }),
  ).toBeVisible();
  await expect(page.locator(".onboarding-save-status")).toHaveText(
    "Enregistré",
    { timeout: 15_000 },
  );

  await page.getByRole("link", { name: "Gérer mon catalogue" }).click();
  const productForm = page
    .locator("form")
    .filter({ has: page.getByLabel("Nom du produit") });
  await productForm.getByLabel("Nom du produit").fill("Marteau E2E");
  await productForm.getByLabel("Prix (FCFA)").fill("5000");
  await page.getByRole("button", { name: "Ajouter le produit" }).click();
  await expect(page.getByRole("status")).toContainText("Produit ajouté.", {
    timeout: 20_000,
  });

  await page.goto(`/dashboard/onboarding?shop=${shopId}`);
  await expect(
    page.getByRole("heading", { name: "Ajoute tes premiers articles" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Continuer" }).click();
  await page.getByLabel("Paiement à la livraison").check();
  await page.getByLabel("Paiement au retrait").check();
  await page.getByRole("button", { name: "Enregistrer et continuer" }).click();
  await expect(
    page.getByRole("heading", { name: "Vérifie ta vitrine" }),
  ).toBeVisible();

  const preview = page.waitForEvent("popup");
  await page.getByRole("link", { name: "Ouvrir l’aperçu privé" }).click();
  const previewPage = await preview;
  await expect(
    previewPage.getByRole("heading", { name: "Aperçu, pas encore publié" }),
  ).toBeVisible();
  await expect(
    previewPage
      .getByRole("region", { name: "Aperçu sur téléphone" })
      .getByRole("heading", { name: "Marteau E2E" }),
  ).toBeVisible();
  await expect(
    previewPage
      .getByRole("region", { name: "Aperçu sur ordinateur" })
      .getByRole("heading", { name: "Marteau E2E" }),
  ).toBeVisible();
  await previewPage.close();

  await page
    .getByRole("button", { name: "Continuer vers la soumission" })
    .click();
  await page.getByRole("button", { name: "Soumettre pour validation" }).click();
  await expect(
    page.getByRole("heading", {
      name: "Ta boutique est en attente de validation",
    }),
  ).toBeVisible({ timeout: 20_000 });
  expect(Date.now() - startedAt).toBeLessThan(540_000);
});

test("un visiteur sans session est redirigé hors du tableau de bord", async ({
  page,
}) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/auth\/login\?next=%2Fdashboard/);
  await expect(
    page.getByRole("heading", { name: "Content de te revoir" }),
  ).toBeVisible();
});

async function registerAndConfirm(
  page: Page,
  request: APIRequestContext,
  email: string,
  password: string,
) {
  await page.goto("/auth/signup");
  await page.getByLabel("Nom complet").fill("Aminata Test");
  await page.getByLabel("Adresse e-mail").fill(email);
  await page.getByLabel("Mot de passe").fill(password);
  await page.getByRole("button", { name: "Créer mon compte" }).click();
  await expect(page.getByRole("status")).toContainText("Compte créé.", {
    timeout: 15_000,
  });

  const link = await getEmailLink(request, email, "signup");
  await openAuthLink(page, link);
}

async function openAuthLink(page: Page, link: string) {
  try {
    await page.goto(link, {
      waitUntil: "domcontentloaded",
      timeout: 90_000,
    });
  } catch (error) {
    const errorName = error instanceof Error ? error.name : "erreur inconnue";
    throw new Error(
      `Le lien d’authentification n’a pas pu être ouvert (${errorName}).`,
    );
  }
}

async function getEmailLink(
  request: APIRequestContext,
  email: string,
  type: "signup" | "magiclink",
) {
  let confirmationLink = "";
  const deadline = Date.now() + 30_000;

  while (!confirmationLink && Date.now() < deadline) {
    const response = await request.get(`${mailpitUrl}/api/v1/messages`);

    if (!response.ok()) {
      throw new Error("Le serveur de courriels local est indisponible.");
    }

    const messages = readMessages(await response.json());

    for (const messageId of messages) {
      const detailResponse = await request.get(
        `${mailpitUrl}/api/v1/message/${encodeURIComponent(messageId)}`,
      );

      if (!detailResponse.ok()) {
        continue;
      }

      const content = collectText(await detailResponse.json()).join("\n");

      if (!content.toLowerCase().includes(email.toLowerCase())) {
        continue;
      }

      const links = content.match(/https?:\/\/[^\s"'<>]+/g) ?? [];
      confirmationLink =
        links
          .map((link) => link.replaceAll("&amp;", "&"))
          .find(
            (link) => link.includes(`/auth/v1/verify`) && link.includes(type),
          ) ?? "";

      if (confirmationLink) {
        break;
      }
    }

    if (!confirmationLink) {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  if (!confirmationLink) {
    throw new Error(`Aucun e-mail ${type} reçu pour le test.`);
  }

  return confirmationLink;
}

function readMessages(value: unknown): string[] {
  if (!isRecord(value) || !Array.isArray(value.messages)) {
    return [];
  }

  return value.messages.flatMap((message) => {
    if (!isRecord(message)) {
      return [];
    }
    const id = message.ID ?? message.id;
    return typeof id === "string" ? [id] : [];
  });
}

function collectText(value: unknown): string[] {
  if (typeof value === "string") {
    return [value];
  }

  if (Array.isArray(value)) {
    return value.flatMap(collectText);
  }

  if (isRecord(value)) {
    return Object.values(value).flatMap(collectText);
  }

  return [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

async function mockTurnstile(page: Page) {
  await page.route(
    "https://challenges.cloudflare.com/turnstile/v0/api.js**",
    (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/javascript",
        body: `
          window.turnstile = {
            render: function (container, options) {
              window.setTimeout(function () {
                options.callback("test-turnstile-token");
              }, 0);
              return "playwright-test-widget";
            },
            remove: function () {}
          };
        `,
      }),
  );
}

function uniqueEmail() {
  return `auth-${Date.now()}-${Math.random().toString(36).slice(2, 9)}@example.com`;
}
