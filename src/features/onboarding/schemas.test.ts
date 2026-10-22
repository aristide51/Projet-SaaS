import { describe, expect, it } from "vitest";
import {
  createDefaultDraft,
  addStepMetrics,
  hasCompleteOpeningHours,
  onboardingDraftSchema,
  saveOnboardingSchema,
  validPhoneSchema,
} from "./schemas";

describe("onboardingDraftSchema", () => {
  it("accepts a complete draft and a valid eight-step checkpoint", () => {
    const draft = createDefaultDraft("boutique-abc123");

    expect(onboardingDraftSchema.safeParse(draft).success).toBe(true);
    expect(
      saveOnboardingSchema.safeParse({ currentStep: 5, draft }).success,
    ).toBe(true);
  });

  it("rejects reserved slugs and out-of-range locations", () => {
    const draft = createDefaultDraft("boutique-abc123");

    expect(
      onboardingDraftSchema.safeParse({ ...draft, slug: "admin" }).success,
    ).toBe(false);
    expect(
      onboardingDraftSchema.safeParse({ ...draft, lat: 120 }).success,
    ).toBe(false);
    expect(validPhoneSchema.safeParse("not-a-number").success).toBe(false);
  });

  it("accepts an incomplete draft but validates time fields when present", () => {
    const draft = createDefaultDraft("boutique-abc123");

    expect(draft.name).toBe("");
    expect(
      onboardingDraftSchema.safeParse({
        ...draft,
        whatsapp: "en cours de saisie",
        openingHours: {
          ...draft.openingHours,
          monday: { closed: false, opensAt: "9h", closesAt: "" },
        },
      }).success,
    ).toBe(false);
    expect(
      onboardingDraftSchema.safeParse({
        ...draft,
        whatsapp: "en cours de saisie",
      }).success,
    ).toBe(true);
  });

  it("only marks opening hours complete when at least one valid day is open", () => {
    const draft = createDefaultDraft("boutique-abc123");

    expect(hasCompleteOpeningHours(draft.openingHours)).toBe(false);
    expect(
      hasCompleteOpeningHours({
        ...draft.openingHours,
        monday: { closed: false, opensAt: "08:00", closesAt: "17:00" },
      }),
    ).toBe(true);
    expect(
      hasCompleteOpeningHours({
        ...draft.openingHours,
        monday: { closed: false, opensAt: "17:00", closesAt: "08:00" },
      }),
    ).toBe(false);
  });

  it("accumulates time, abandonments, and help requests per step", () => {
    const draft = createDefaultDraft("boutique-abc123");
    const withHelp = {
      ...draft,
      metrics: {
        steps: {
          "2": { elapsedMs: 0, abandonCount: 0, helpCount: 1 },
        },
      },
    };
    const firstVisit = addStepMetrics(withHelp, 2, 45_000, true);
    const secondVisit = addStepMetrics(firstVisit, 2, 30_000, false);

    expect(secondVisit.metrics.steps["2"]).toEqual({
      elapsedMs: 75_000,
      abandonCount: 1,
      helpCount: 1,
    });
    expect(addStepMetrics(secondVisit, 5, 90_000, true)).toBe(secondVisit);
  });
});
