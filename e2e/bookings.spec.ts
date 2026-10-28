import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { expect, test, type BrowserContext } from "@playwright/test";

const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const projectUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:55421";

test("configuration complète de l’agenda en moins de trois minutes", async ({
  page,
}) => {
  test.setTimeout(180_000);
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
  const email = `bookings-${crypto.randomUUID()}@test.invalid`;
  const password = `Booking!${crypto.randomUUID().slice(0, 12)}`;
  let userId: string | null = null;
  let proShopId: string | null = null;
  let freeShopId: string | null = null;

  try {
    const { data: createdUser, error: userError } =
      await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
    if (userError) throw new Error("Le compte E2E n’a pas pu être créé.");
    const ownerId = createdUser.user.id;
    userId = ownerId;

    const createShop = async (name: string) => {
      const { data: shop, error } = await admin
        .from("shops")
        .insert({
          created_by: ownerId,
          slug: `agenda-${crypto.randomUUID().slice(0, 10)}`,
          name,
          review_status: "approved",
        })
        .select("id")
        .single();
      if (error) throw new Error("La boutique E2E n’a pas pu être créée.");
      return shop.id;
    };

    proShopId = await createShop("Boutique E2E agenda Pro");
    freeShopId = await createShop("Boutique E2E agenda Gratuit");
    const { data: proPlan, error: planError } = await admin
      .from("plans")
      .select("id")
      .eq("code", "pro")
      .single();
    if (planError) throw new Error("Le plan Pro E2E n’a pas été trouvé.");
    const { error: subscriptionError } = await admin
      .from("subscriptions")
      .update({ plan_id: proPlan.id, status: "active" })
      .eq("shop_id", proShopId);
    if (subscriptionError) {
      throw new Error("L’abonnement Pro E2E n’a pas pu être activé.");
    }

    await signIn(page.context(), email, password, anonKey);

    const startedAt = Date.now();
    await page.goto(`/dashboard/bookings?shop=${proShopId}`);
    await expect(
      page.getByRole("heading", { name: "Agenda et rendez-vous" }),
    ).toBeVisible();

    await page.getByLabel("Nom de la ressource").fill("Coiffeuse E2E");
    await page.getByRole("button", { name: "Ajouter une ressource" }).click();
    await expect(page.getByRole("status")).toContainText(
      "La ressource a été ajoutée.",
    );
    const resourceCard = page
      .getByRole("list")
      .filter({ hasText: "Coiffeuse E2E" })
      .first();
    await expect(resourceCard).toBeVisible();

    const monday = page.getByRole("group", { name: "Lundi" });
    await monday.getByRole("button", { name: "Ajouter une plage" }).click();
    await monday
      .getByLabel("Ressource")
      .selectOption({ label: "Coiffeuse E2E" });
    await monday.locator('input[type="time"]').nth(0).fill("08:00");
    await monday.locator('input[type="time"]').nth(1).fill("12:00");
    await monday.getByRole("button", { name: "Ajouter une plage" }).click();
    await monday.getByLabel("Ressource").nth(1).selectOption({
      label: "Coiffeuse E2E",
    });
    await monday.locator('input[type="time"]').nth(2).fill("14:00");
    await monday.locator('input[type="time"]').nth(3).fill("18:00");
    await page
      .getByRole("button", { name: "Enregistrer les horaires" })
      .click();
    await expect(page.getByRole("status")).toContainText(
      "Les horaires ont été enregistrés.",
    );

    const services = page
      .locator("section.team-section")
      .filter({ has: page.getByRole("heading", { name: "Services" }) });
    const newService = services.locator("form").first();
    await newService.getByLabel("Nom").fill("Coupe E2E");
    await newService.getByLabel("Description").fill("Coupe et coiffage");
    await newService.getByLabel("Durée (minutes)").fill("60");
    await newService.getByLabel("Prix (FCFA)").fill("10000");
    await newService.getByLabel("Acompte (FCFA)").fill("1000");
    await newService
      .getByRole("button", { name: "Ajouter un service" })
      .click();
    await expect(page.getByRole("status")).toContainText(
      "Le service a été ajouté.",
    );
    await expect(services.locator("form").nth(1).getByLabel("Nom")).toHaveValue(
      "Coupe E2E",
    );

    const closures = page.locator("section.team-section").filter({
      has: page.getByRole("heading", { name: "Fermetures exceptionnelles" }),
    });
    const closureForm = closures.locator("form");
    const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    await closureForm.getByLabel("Ressource concernée").selectOption("");
    await closureForm.getByLabel("Début — date").fill(futureDate);
    await closureForm.getByLabel("Début — heure").fill("00:00");
    await closureForm.getByLabel("Fin — date").fill(futureDate);
    await closureForm.getByLabel("Fin — heure").fill("23:59");
    await closureForm.getByLabel("Motif").fill("Fermeture de contrôle E2E");
    await closureForm
      .getByRole("button", { name: "Ajouter la fermeture" })
      .click();
    await expect(page.getByRole("status")).toContainText(
      "La fermeture exceptionnelle a été enregistrée.",
    );
    await expect(closures).toContainText("Fermeture de contrôle E2E");

    const settings = page.locator("section.team-section").filter({
      has: page.getByRole("heading", { name: "Réglages de réservation" }),
    });
    await settings.getByLabel("Préavis minimal (heures)").fill("4");
    await settings
      .getByLabel("Délai d’annulation avant le rendez-vous (heures)")
      .fill("12");
    await settings
      .getByLabel("Confirmer automatiquement les nouvelles réservations")
      .check();
    await settings
      .getByRole("button", { name: "Enregistrer les réglages" })
      .click();
    await expect(page.getByRole("status")).toContainText(
      "Les réglages ont été enregistrés.",
    );

    expect(Date.now() - startedAt).toBeLessThan(180_000);

    await page.goto(`/dashboard/bookings?shop=${freeShopId}`);
    await expect(page.getByText(/réservés au plan Pro/)).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Découvrir le plan Pro" }),
    ).toHaveAttribute("href", `/dashboard/abonnement?shop=${freeShopId}`);
  } finally {
    if (proShopId) await admin.from("shops").delete().eq("id", proShopId);
    if (freeShopId) await admin.from("shops").delete().eq("id", freeShopId);
    if (userId) await admin.auth.admin.deleteUser(userId);
  }
});

async function signIn(
  context: BrowserContext,
  email: string,
  password: string,
  anonKey: string,
) {
  const authCookies: { name: string; value: string }[] = [];
  const supabase = createServerClient(projectUrl, anonKey, {
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
    throw new Error("La session E2E authentifiée n’a pas pu être créée.");
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
