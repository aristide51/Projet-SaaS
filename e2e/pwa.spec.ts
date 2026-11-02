import { expect, test } from "@playwright/test";

test("installe la PWA et sert une page publique déjà visitée hors connexion", async ({
  page,
  context,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const homeResponse = await page.goto("/");
  expect(homeResponse?.headers()["x-pwa-cacheable"]).toBe("public");
  await expect(page.locator('link[rel="manifest"]')).toHaveCount(0);
  await expect(
    page.getByRole("heading", {
      name: "Votre commerce en ligne.",
    }),
  ).toBeVisible();

  const manifestResponse = await page.request.get("/pwa-manifest.webmanifest");
  expect(manifestResponse.ok()).toBe(true);
  const manifest = await manifestResponse.json();
  expect(manifest.start_url).toBe("/dashboard");
  expect(manifest.display).toBe("standalone");
  expect(manifest.icons).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ sizes: "192x192" }),
      expect.objectContaining({ sizes: "512x512", purpose: "maskable" }),
    ]),
  );

  await expect
    .poll(() =>
      page.evaluate(() => navigator.serviceWorker.controller?.scriptURL ?? ""),
    )
    .toContain("/sw.js");
  await page.reload();
  const cachedOfflineAssets = await page.evaluate(async () => {
    const cache = await caches.open("boutiques-locales-static-2026-11-02-v3");
    const offlinePage = await cache.match("/offline.html");
    const offlineScript = await cache.match("/pwa-offline.js");
    return {
      offlinePageHasPrivateSection: (await offlinePage?.text())?.includes(
        'id="private-offline-data"',
      ),
      hasOfflineScript: Boolean(offlineScript),
    };
  });
  expect(cachedOfflineAssets).toEqual({
    offlinePageHasPrivateSection: true,
    hasOfflineScript: true,
  });
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const keys = await caches.keys();
        const publicCache = keys.find((key) =>
          key.startsWith("boutiques-locales-public-pages-"),
        );
        if (!publicCache) return false;
        const cache = await caches.open(publicCache);
        return Boolean(await cache.match(location.href));
      }),
    )
    .toBe(true);

  await context.setOffline(true);
  await page.reload();
  await page.evaluate(() => window.dispatchEvent(new Event("offline")));
  await expect(
    page.getByRole("heading", {
      name: "Votre commerce en ligne.",
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("status").filter({ hasText: "Hors connexion" }),
  ).toBeVisible();
  await page.evaluate(() => {
    const form = document.createElement("form");
    form.method = "post";
    const submit = document.createElement("button");
    form.append(submit);
    document.body.append(form);
    form.requestSubmit(submit);
  });
  await expect(page.locator("#pwa-offline-banner")).toContainText(
    "Action indisponible",
  );

  const privateRoute = await page.goto("/account");
  expect(privateRoute?.status()).toBe(200);
  await expect(
    page.getByRole("heading", { name: "Tu es hors connexion" }),
  ).toBeVisible();
});

test("affiche uniquement les données chiffrées du compte actif hors ligne", async ({
  page,
  context,
}) => {
  const homeResponse = await page.goto("/");
  expect(homeResponse?.ok()).toBe(true);
  await expect
    .poll(() =>
      page.evaluate(() => navigator.serviceWorker.controller?.scriptURL ?? ""),
    )
    .toContain("/sw.js");
  await page.reload();

  await page.evaluate(async () => {
    const userA = "11111111-1111-4111-8111-111111111111";
    const userB = "22222222-2222-4222-8222-222222222222";
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("boutiques-locales-private-v2", 1);
      request.onupgradeneeded = () => {
        request.result.createObjectStore("snapshots", { keyPath: "key" });
        request.result.createObjectStore("keys", { keyPath: "key" });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    async function addAccount(userId: string, marker: string) {
      const cryptoKey = await crypto.subtle.generateKey(
        { name: "AES-GCM", length: 256 },
        false,
        ["encrypt", "decrypt"],
      );
      const snapshots: {
        key: string;
        userId: string;
        kind: "orders" | "bookings";
        iv: Uint8Array;
        ciphertext: ArrayBuffer;
      }[] = [];

      for (const [kind, data] of [
        [
          "orders",
          {
            orders: [
              {
                code: `COM-${marker}`,
                shop_id: marker,
                status: "pending_payment",
                total: 2500,
                items: [{ name_snapshot: `Article ${marker}`, quantity: 1 }],
              },
            ],
            shops: [{ id: marker, name: `Boutique ${marker}` }],
          },
        ],
        [
          "bookings",
          [
            {
              serviceName: `Service ${marker}`,
              shopName: `Boutique ${marker}`,
              startsAt: "2026-11-02T10:00:00.000Z",
              status: "confirmed",
            },
          ],
        ],
      ] as const) {
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const ciphertext = await crypto.subtle.encrypt(
          { name: "AES-GCM", iv },
          cryptoKey,
          new TextEncoder().encode(JSON.stringify(data)),
        );
        snapshots.push({
          key: `${userId}:${kind}`,
          userId,
          kind,
          iv,
          ciphertext,
        });
      }
      const transaction = database.transaction(
        ["snapshots", "keys"],
        "readwrite",
      );
      transaction.objectStore("keys").put({ key: userId, cryptoKey });
      for (const snapshot of snapshots) {
        transaction.objectStore("snapshots").put(snapshot);
      }
      await new Promise<void>((resolve, reject) => {
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
      });
    }

    await addAccount(userA, "COMPTE-A");
    await addAccount(userB, "COMPTE-B");
    localStorage.setItem("boutiques-locales-private-user", userA);
    database.close();
  });

  await context.setOffline(true);
  await page.goto("/account/bookings");
  await expect(page.locator("html")).toHaveAttribute(
    "data-private-data-script",
    "loaded",
  );
  await expect(page.locator("#private-offline-data")).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: "Tes données enregistrées sur cet appareil",
    }),
  ).toBeVisible();
  await expect(page.getByText("COM-COMPTE-A")).toBeVisible();
  await expect(page.getByText("Service COMPTE-A")).toBeVisible();
  await expect(page.getByText("COM-COMPTE-B")).toHaveCount(0);
  await expect(page.getByText("Service COMPTE-B")).toHaveCount(0);
});
