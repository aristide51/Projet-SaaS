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

  const storedAuthKeys = await page.evaluate(() =>
    Object.keys(localStorage).filter((key) => /auth|token|supabase/i.test(key)),
  );
  expect(storedAuthKeys).toEqual([]);

  const authCookies = (await context.cookies()).filter((cookie) =>
    cookie.name.includes("auth-token"),
  );
  expect(authCookies.length).toBeGreaterThan(0);
  expect(authCookies.every((cookie) => cookie.httpOnly)).toBe(true);

  await page.getByRole("button", { name: "Se déconnecter" }).click();
  await expect(page).toHaveURL(/\/auth\/login$/, { timeout: 15_000 });

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

  await page.getByLabel("Nom du produit").fill("Test pneu catalogue");
  await page.getByLabel("Prix (FCFA)").fill("12500");
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
  await page.getByLabel(/Photos/).setInputFiles({
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
