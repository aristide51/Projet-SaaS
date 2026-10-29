import { expect, test } from "@playwright/test";

test("les scripts HTML reçoivent le nonce de la CSP", async ({ page }) => {
  const response = await page.goto("/");

  if (!response) {
    throw new Error("La page d’accueil n’a pas répondu.");
  }

  const contentSecurityPolicy = await response.headerValue(
    "content-security-policy",
  );
  const nonce = contentSecurityPolicy?.match(/'nonce-([^']+)'/)?.[1];
  const scriptTags = (await response.text()).match(/<script\b[^>]*>/g) ?? [];

  expect(nonce).toBeTruthy();
  expect(scriptTags.length).toBeGreaterThan(0);
  expect(
    scriptTags.every((scriptTag) => scriptTag.includes(`nonce="${nonce}"`)),
  ).toBe(true);
});

test("la route de santé répond sans mise en cache avec les en-têtes de sécurité", async ({
  request,
}) => {
  const response = await request.get("/api/health");

  expect(response.ok()).toBe(true);
  expect(await response.json()).toEqual({ status: "ok" });
  expect(response.headers()["cache-control"]).toBe("no-store");
  expect(response.headers()["x-content-type-options"]).toBe("nosniff");
  expect(response.headers()["referrer-policy"]).toBe(
    "strict-origin-when-cross-origin",
  );
  expect(response.headers()["permissions-policy"]).toContain("camera=()");
  const contentSecurityPolicy =
    response.headers()["content-security-policy"] ?? "";
  expect(contentSecurityPolicy).toContain("nonce-");
  const scriptDirective = contentSecurityPolicy
    .split(";")
    .find((directive) => directive.trimStart().startsWith("script-src"));
  expect(scriptDirective).toBeDefined();
  expect(scriptDirective).not.toContain("'unsafe-inline'");
  const styleElementDirective = contentSecurityPolicy
    .split(";")
    .find((directive) => directive.trimStart().startsWith("style-src "));
  expect(styleElementDirective).toBeDefined();
  expect(styleElementDirective).not.toContain("'unsafe-inline'");
  expect(contentSecurityPolicy).toContain("style-src-attr 'unsafe-inline'");
});

test("une requête d’écriture avec une origine étrangère est refusée", async ({
  request,
}) => {
  const response = await request.post("/api/health", {
    headers: { Origin: "https://evil.example" },
  });

  expect(response.status()).toBe(403);
  expect(await response.json()).toEqual({
    error: "Origine non autorisée.",
  });
});
