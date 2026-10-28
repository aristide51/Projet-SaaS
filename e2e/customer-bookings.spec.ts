import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";

const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const projectUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:55421";

test("deux clients ne peuvent pas réserver le même créneau", async ({
  browser,
}) => {
  test.setTimeout(120_000);
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
  const users: { id: string; email: string; password: string }[] = [];
  const contexts: BrowserContext[] = [];
  let shopId: string | null = null;

  try {
    for (let index = 0; index < 3; index += 1) {
      const email = `booking-race-${crypto.randomUUID()}@test.invalid`;
      const password = `Booking!${crypto.randomUUID().slice(0, 12)}`;
      const { data, error } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
      if (error) throw new Error("Un compte client E2E n’a pas pu être créé.");
      users.push({ id: data.user.id, email, password });

      const { error: profileError } = await admin
        .from("profiles")
        .update({ phone: `+2267011111${index}` })
        .eq("id", data.user.id);
      if (profileError) {
        throw new Error("Le téléphone du client E2E n’a pas pu être ajouté.");
      }
    }

    const slug = `booking-race-${crypto.randomUUID().slice(0, 10)}`;
    const owner = users[0];
    if (!owner) throw new Error("Le propriétaire du test E2E est introuvable.");
    const { data: shop, error: shopError } = await admin
      .from("shops")
      .insert({
        created_by: owner.id,
        slug,
        name: "Salon E2E réservation",
        review_status: "approved",
      })
      .select("id, name")
      .single();
    if (shopError) throw new Error("La boutique E2E n’a pas pu être créée.");
    shopId = shop.id;

    const { data: proPlan, error: planError } = await admin
      .from("plans")
      .select("id")
      .eq("code", "pro")
      .single();
    if (planError) throw new Error("Le plan Pro E2E n’a pas été trouvé.");
    const { error: subscriptionError } = await admin
      .from("subscriptions")
      .update({ plan_id: proPlan.id, status: "active" })
      .eq("shop_id", shop.id);
    if (subscriptionError) {
      throw new Error("Le plan Pro E2E n’a pas pu être activé.");
    }

    const { data: resource, error: resourceError } = await admin
      .from("resources")
      .select("id")
      .eq("shop_id", shop.id)
      .eq("name", "Principal")
      .single();
    if (resourceError) {
      throw new Error("La ressource de réservation E2E est introuvable.");
    }

    const { error: serviceError } = await admin.from("services").insert({
      shop_id: shop.id,
      name: "Consultation E2E",
      duration_min: 60,
      price: 5000,
      active: true,
    });
    if (serviceError) throw new Error("Le service E2E n’a pas pu être créé.");

    const bookingDate = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
    bookingDate.setUTCHours(0, 0, 0, 0);
    const bookingDateValue = bookingDate.toISOString().slice(0, 10);
    const { error: scheduleError } = await admin
      .from("availability_rules")
      .insert({
        shop_id: shop.id,
        resource_id: resource.id,
        weekday: bookingDate.getUTCDay(),
        start_time: "10:00",
        end_time: "11:00",
      });
    if (scheduleError) {
      throw new Error("L’horaire de réservation E2E n’a pas pu être créé.");
    }

    const pages: Page[] = [];
    for (const user of users.slice(1)) {
      const context = await browser.newContext();
      contexts.push(context);
      await signIn(context, user.email, user.password, anonKey);
      pages.push(await context.newPage());
    }

    const path = `/${encodeURIComponent(slug)}/bookings`;
    await Promise.all(pages.map((page) => page.goto(path)));
    for (const page of pages) {
      await expect(
        page.getByRole("heading", {
          name: `Prendre rendez-vous chez ${shop.name}`,
        }),
      ).toBeVisible();
      await page.getByLabel("Date", { exact: true }).fill(bookingDateValue);
      const slots = page.locator('input[name="booking-slot"]');
      await expect
        .poll(
          async () =>
            (await slots.count()) > 0 ||
            (await page.locator(".customer-booking [role=alert]").count()) > 0,
          { timeout: 20_000 },
        )
        .toBe(true);
      if ((await slots.count()) === 0) {
        const message = await page
          .locator(".customer-booking [role=alert]")
          .textContent();
        throw new Error(
          `Les créneaux E2E n’ont pas été chargés : ${message ?? "aucun détail"}`,
        );
      }
      await slots.check();
    }

    const selectedStarts = await Promise.all(
      pages.map((page) =>
        page.locator('input[name="booking-slot"]:checked').inputValue(),
      ),
    );
    if (new Set(selectedStarts).size !== 1) {
      throw new Error(
        `Les deux clients n’ont pas sélectionné le même créneau : ${JSON.stringify(selectedStarts)}`,
      );
    }

    await Promise.all(
      pages.map((page) =>
        expect(
          page.getByRole("button", { name: "Confirmer le rendez-vous" }),
        ).toBeEnabled(),
      ),
    );
    await Promise.all(
      pages.map((page) =>
        page.getByRole("button", { name: "Confirmer le rendez-vous" }).click(),
      ),
    );

    await expect
      .poll(
        async () =>
          Promise.all(
            pages.map((page) =>
              page.locator(".customer-booking .ui-message").count(),
            ),
          ).then((counts) => counts.every((count) => count > 0)),
        { timeout: 15_000 },
      )
      .toBe(true);
    const { data: createdBookings, error: bookingLookupError } = await admin
      .from("bookings")
      .select("id, resource_id, during, status")
      .eq("shop_id", shop.id);
    if (bookingLookupError) {
      throw new Error("Les réservations E2E n’ont pas pu être vérifiées.");
    }
    const outcomes = await Promise.all(
      pages.map((page) =>
        page.locator(".customer-booking .ui-message").allTextContents(),
      ),
    );
    if (createdBookings.length !== 1) {
      throw new Error(
        `Les réponses ${JSON.stringify(outcomes)} ont créé ${createdBookings.length} rendez-vous : ${JSON.stringify(createdBookings)}.`,
      );
    }
    expect(
      outcomes
        .flat()
        .filter((message) => message.includes("bien été enregistrée")),
    ).toHaveLength(1);
    expect(
      outcomes
        .flat()
        .filter((message) => message.includes("vient d’être réservé")),
    ).toHaveLength(1);

    const successfulPage = await Promise.all(
      pages.map(async (page) => ({
        page,
        messages: await page
          .locator(".customer-booking .ui-message")
          .allTextContents(),
      })),
    ).then(
      (results) =>
        results.find(({ messages }) =>
          messages.some((message) => message.includes("bien été enregistrée")),
        )?.page,
    );
    if (!successfulPage) {
      throw new Error("Aucun client E2E n’a reçu la confirmation attendue.");
    }

    await successfulPage.goto("/account/bookings");
    await expect(
      successfulPage
        .getByRole("heading", {
          name: "Mes rendez-vous",
          exact: true,
        })
        .first(),
    ).toBeVisible();
    await successfulPage.getByRole("button", { name: "Annuler" }).click();
    await expect(
      successfulPage.getByRole("status").filter({
        hasText: "Le rendez-vous a été annulé.",
      }),
    ).toBeVisible();
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
    if (shopId) await admin.from("shops").delete().eq("id", shopId);
    await Promise.all(
      users.map((user) => admin.auth.admin.deleteUser(user.id)),
    );
  }
});

async function signIn(
  context: BrowserContext,
  email: string,
  password: string,
  key: string,
) {
  const authCookies: { name: string; value: string }[] = [];
  const supabase = createServerClient(projectUrl, key, {
    cookies: {
      getAll: () => [],
      setAll: (cookiesToSet) => {
        authCookies.push(
          ...cookiesToSet.map(({ name, value }) => ({ name, value })),
        );
      },
    },
  });
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (error || !data.user.email_confirmed_at || authCookies.length === 0) {
    throw new Error("La session client E2E n’a pas pu être créée.");
  }
  await context.addCookies(
    authCookies.map(({ name, value }) => ({
      name,
      value,
      url: "http://127.0.0.1:3000",
      httpOnly: true,
      secure: false,
      sameSite: "Lax" as const,
    })),
  );
}
