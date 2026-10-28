import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("page d’accueil marketing accessible et complète", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");

  await expect(
    page.getByRole("heading", {
      name: "Votre commerce mérite sa place en ligne.",
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: "Un produit qui se construit avec le terrain.",
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: "Commencez léger. Évoluez à votre rythme.",
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Ouvrir ma boutique" }),
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

test("la scène 3D reste sous 150 Kio de JavaScript transféré", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator(".platform-scene canvas")).toBeVisible({
    timeout: 20_000,
  });

  const sceneScriptBytes = await page.evaluate(() => {
    const mark = performance
      .getEntriesByName("marketing-scene-requested", "mark")
      .at(-1)?.startTime;
    if (mark === undefined) return null;

    return performance
      .getEntriesByType("resource")
      .filter(
        (entry): entry is PerformanceResourceTiming =>
          entry instanceof PerformanceResourceTiming &&
          entry.initiatorType === "script" &&
          entry.name.includes("/_next/static/chunks/") &&
          entry.startTime >= mark,
      )
      .reduce((total, entry) => total + entry.encodedBodySize, 0);
  });

  expect(
    sceneScriptBytes,
    "La scène doit marquer le début de son chargement",
  ).not.toBeNull();
  expect(sceneScriptBytes).toBeLessThan(150 * 1024);
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
