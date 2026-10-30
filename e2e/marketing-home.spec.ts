import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("page d’accueil marketing accessible et complète", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");

  await expect(
    page.getByRole("heading", {
      name: "Faites grandir votre commerce.",
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: "Tout votre commerce. Au même endroit.",
    }),
  ).toBeVisible();
  await expect(page.locator(".benefit-card")).toHaveCount(3);
  await expect(page.locator(".benefit-card__icon")).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Votre vitrine en ligne" }),
  ).toBeVisible();
  const headingFont = await page
    .locator("h1")
    .evaluate((heading) =>
      window.getComputedStyle(heading).fontFamily.toLowerCase(),
    );
  expect(headingFont).toContain("unbounded");
  const bodyFont = await page
    .locator("body")
    .evaluate((body) => window.getComputedStyle(body).fontFamily.toLowerCase());
  expect(bodyFont).toContain("inter");
  await expect(page.locator(".marketing-hero")).toHaveCSS(
    "background-image",
    /rgb\(8, 120, 47\)/,
  );
  await expect(page.locator(".marketing-hero .marketing-button")).toHaveCSS(
    "background-color",
    "rgb(225, 11, 23)",
  );
  await page.locator(".benefit-card").first().hover();
  await expect(page.locator(".benefit-card").first()).toHaveCSS(
    "translate",
    "none",
  );
  await expect(
    page.getByRole("heading", {
      name: "Choisissez votre offre.",
    }),
  ).toBeVisible();
  const reducedMotionOffer = page.locator(".pricing-offer-card").first();
  if (await reducedMotionOffer.count()) {
    await reducedMotionOffer.hover();
    await expect(reducedMotionOffer).toHaveCSS("transform", "none");
  }
  await expect(
    page
      .locator(".marketing-hero")
      .locator(".marketing-hero__actions")
      .getByRole("link", { name: "Créer ma boutique" }),
  ).toHaveAttribute("href", "/auth/signup");

  const violations = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(violations.violations).toEqual([]);

  const firstFaq = page.locator(".faq-list details").first();
  const firstQuestion = firstFaq.locator("summary");
  await firstQuestion.focus();
  await page.keyboard.press("Enter");
  await expect(firstFaq).toHaveAttribute("open", "");
  await expect(firstFaq).toContainText(/sans écrire de code/);

  const solutionsMenu = page.locator(".marketing-nav__menu");
  const solutionsTrigger = solutionsMenu.getByRole("link", {
    name: "Solutions",
  });
  const solutionsPanel = solutionsMenu.locator(".marketing-nav__panel");
  await expect(solutionsPanel).toBeHidden();
  await solutionsTrigger.hover();
  await expect(
    solutionsMenu.getByRole("link", { name: /Vitrine/ }),
  ).toBeVisible();
  await page.mouse.move(0, 0);
  await expect(solutionsPanel).toBeHidden();
  await solutionsTrigger.focus();
  await expect(solutionsPanel).toBeVisible();
});

test("l’aperçu s’adapte aux métiers et le menu mobile reste utilisable", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/");

  const preview = page.locator(".business-preview");
  await expect(
    preview.getByRole("heading", {
      name: "Une vitrine à partager",
    }),
  ).toBeVisible();
  await preview.getByRole("button", { name: "Garage" }).click();
  await expect(
    preview.getByRole("heading", {
      name: "Vos services en ligne",
    }),
  ).toBeVisible();

  const menu = page.locator(".marketing-mobile-menu");
  await menu.locator("summary").click();
  await expect(menu.getByRole("navigation")).toBeVisible();
  await expect(menu.getByRole("link", { name: "Tarifs" })).toHaveAttribute(
    "href",
    "#offres",
  );
});

test("l’illustration 3D laisse place au repli sur appareil modeste", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "deviceMemory", {
      configurable: true,
      value: 2,
    });
  });
  await page.goto("/");

  await expect(page.locator(".platform-scene__fallback")).toBeVisible();
  await expect(page.locator(".platform-scene canvas")).toHaveCount(0);
});

test("la scène 3D se charge après validation des capacités", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "deviceMemory", {
      configurable: true,
      value: 8,
    });
    Object.defineProperty(navigator, "hardwareConcurrency", {
      configurable: true,
      value: 8,
    });
  });
  await page.goto("/");

  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  await expect(page.locator(".platform-scene__fallback")).toBeVisible();
  await expect(page.locator(".platform-scene canvas")).toHaveCount(1, {
    timeout: 15_000,
  });
});

test("une API de compatibilité qui ne répond pas ne bloque pas la page", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "userAgentData", {
      configurable: true,
      value: {
        platform: "Android",
        getHighEntropyValues: () => new Promise(() => {}),
      },
    });
  });
  await page.goto("/");

  await expect(
    page.getByRole("heading", {
      name: "Faites grandir votre commerce.",
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Préparation de votre expérience" }),
  ).toHaveCount(0);
});

test("la page reste lisible sur un écran mobile étroit", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/");

  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(360);
});

test("les cartes Framer Motion s’animent quand le mouvement est autorisé", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/");

  const card = page.locator(".benefit-card-motion").first();
  await card.scrollIntoViewIfNeeded();
  await card.hover();
  await expect(card).toHaveCSS("transform", /matrix/);

  const offerCard = page.locator(".pricing-offer-card").first();
  if (await offerCard.count()) {
    await offerCard.scrollIntoViewIfNeeded();
    await offerCard.hover();
    await expect(offerCard).toHaveCSS("transform", /matrix/);
    await expect(offerCard.locator(".pricing-offer-card__art")).toHaveCSS(
      "transform",
      /matrix/,
    );
    await expect(offerCard.locator(".pricing-offer-card__amount")).toHaveCSS(
      "transform",
      /matrix/,
    );
  }
});

test("les cartes des offres restent animées sans JavaScript", async ({
  browser,
}) => {
  const context = await browser.newContext({
    javaScriptEnabled: false,
    reducedMotion: "no-preference",
  });

  try {
    const page = await context.newPage();
    await page.goto("/");

    const card = page.locator(".pricing-offer-card").first();
    const initialBounds = await card.boundingBox();
    if (!initialBounds) {
      throw new Error("La première carte d’offre n’est pas visible.");
    }
    const price = card.locator(".pricing-offer-card__amount");
    const initialPriceWidth = (await price.boundingBox())?.width;
    if (initialPriceWidth === undefined) {
      throw new Error("Le prix de l’offre n’est pas visible.");
    }

    await card.hover();
    await expect
      .poll(async () => (await card.boundingBox())?.width ?? initialBounds.width)
      .toBeGreaterThan(initialBounds.width * 1.03);
    await expect
      .poll(async () => (await price.boundingBox())?.width ?? initialPriceWidth)
      .toBeGreaterThan(initialPriceWidth * 1.1);
  } finally {
    await context.close();
  }
});
