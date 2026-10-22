import { expect, test } from "@playwright/test";

test("affiche la page d’accueil en français", async ({ page }) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: "Les commerces locaux, en ligne." }),
  ).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "fr");
});
