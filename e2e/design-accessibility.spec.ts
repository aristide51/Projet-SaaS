import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test.use({ reducedMotion: "reduce" });

test("la page Design respecte les règles WCAG AA", async ({ page }) => {
  await page.goto("/design");
  await expect(
    page.getByRole("heading", { name: /Un commerce local/ }),
  ).toBeVisible();

  const axe = new AxeBuilder({ page }).withTags([
    "wcag2a",
    "wcag2aa",
    "wcag21a",
    "wcag21aa",
    "wcag22aa",
  ]);
  const results = await axe.analyze();

  expect(results.violations).toEqual([]);

  await page.getByRole("button", { name: "Activer le thème sombre" }).click();
  const darkResults = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();

  expect(darkResults.violations).toEqual([]);
});

test("les contrôles de thème, d’onglets, de dialogue et de panneau sont utilisables", async ({
  page,
}) => {
  await page.goto("/design");

  await page.getByRole("button", { name: "Activer le thème sombre" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

  const tabs = page.getByRole("tablist", {
    name: "Fonctionnalités de la plateforme",
  });
  await tabs.getByRole("tab", { name: "Mobile money" }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(tabs.getByRole("tab", { name: "Rendez-vous" })).toHaveAttribute(
    "aria-selected",
    "true",
  );

  await page.getByRole("button", { name: "Ouvrir la fenêtre" }).click();
  const dialog = page.getByRole("dialog", {
    name: "Prête à être découverte ?",
  });
  await expect(dialog).toBeVisible();
  const dialogResults = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(dialogResults.violations).toEqual([]);
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();

  await page.getByRole("button", { name: "Voir le panneau" }).click();
  const sheet = page.getByRole("dialog", { name: "Votre boutique" });
  await expect(sheet).toBeVisible();
  const sheetResults = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(sheetResults.violations).toEqual([]);
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: "Tester une confirmation" }).click();
  await expect(page.getByRole("status")).toContainText("C’est enregistré");
});

test("la galerie reste sans débordement horizontal sur petit écran", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/design");

  await expect(
    page.getByRole("heading", { name: /Un commerce local/ }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
});
