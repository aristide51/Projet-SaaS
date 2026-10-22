import { afterEach, describe, expect, it, vi } from "vitest";

const { createClient, getUser } = vi.hoisted(() => ({
  createClient: vi.fn(),
  getUser: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient,
  getUser,
}));

vi.mock("@/lib/monitoring/sentry", () => ({
  logError: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

import {
  checkShopSlugAvailability,
  createOnboardingShop,
  saveOnboardingDraft,
} from "./actions";
import { createDefaultDraft } from "./schemas";

describe("shop onboarding server actions", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("does not create a shop for an unverified user", async () => {
    getUser.mockResolvedValue({
      id: "user-1",
      email_confirmed_at: null,
    });

    await expect(createOnboardingShop()).resolves.toEqual({
      success: false,
      message: "Connecte-toi avec une adresse e-mail confirmée.",
    });
    expect(createClient).not.toHaveBeenCalled();
  });

  it("rejects invalid slugs before checking availability", async () => {
    await expect(
      checkShopSlugAvailability(
        "admin",
        "00000000-0000-4000-8000-000000000000",
      ),
    ).resolves.toMatchObject({ success: false });
    expect(getUser).not.toHaveBeenCalled();
  });

  it("does not save a draft for an unverified user", async () => {
    getUser.mockResolvedValue({
      id: "user-1",
      email_confirmed_at: null,
    });

    await expect(
      saveOnboardingDraft("00000000-0000-4000-8000-000000000000", {
        currentStep: 1,
        draft: createDefaultDraft("boutique-abc123"),
      }),
    ).resolves.toMatchObject({ success: false });
    expect(createClient).not.toHaveBeenCalled();
  });

  it("stores incomplete fields without projecting them onto the shop row", async () => {
    const query = {
      select: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: { id: "00000000-0000-4000-8000-000000000000" },
        error: null,
      }),
    };
    const supabase = {
      from: vi.fn(() => query),
    };
    getUser.mockResolvedValue({
      id: "user-1",
      email_confirmed_at: "2025-01-01T00:00:00.000Z",
    });
    createClient.mockResolvedValue(supabase);

    const draft = createDefaultDraft("");
    draft.name = "A";
    draft.slug = "";
    draft.whatsapp = "en cours de saisie";
    draft.city = "";
    draft.openingHours.monday = {
      closed: false,
      opensAt: "",
      closesAt: "",
    };

    const result = await saveOnboardingDraft(
      "00000000-0000-4000-8000-000000000000",
      {
        currentStep: 2,
        draft,
      },
    );
    expect(result).toEqual({ success: true, message: "Enregistré." });

    const shopUpdates = query.update.mock.calls[0]?.[0];
    expect(shopUpdates).not.toHaveProperty("name");
    expect(shopUpdates).not.toHaveProperty("slug");
    expect(shopUpdates).not.toHaveProperty("city");
    expect(shopUpdates).not.toHaveProperty("opening_hours");
    expect(query.update).toHaveBeenCalledWith(
      expect.objectContaining({
        draft: expect.objectContaining({ name: "A" }),
      }),
    );
  });
});
