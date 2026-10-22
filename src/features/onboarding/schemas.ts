import { z } from "zod";

export const SHOP_CATEGORIES = [
  "hardware",
  "auto_parts",
  "garage",
  "salon",
  "other",
] as const;

const timeValueSchema = z
  .string()
  .max(5)
  .refine((value) => value === "" || /^([01]\d|2[0-3]):[0-5]\d$/.test(value));

const openingDaySchema = z
  .object({
    closed: z.boolean(),
    opensAt: timeValueSchema,
    closesAt: timeValueSchema,
  })
  .strict();

const shopSlugSchema = z
  .string()
  .regex(/^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/)
  .refine(
    (value) =>
      ![
        "www",
        "api",
        "app",
        "admin",
        "dashboard",
        "support",
        "mail",
        "static",
        "cdn",
      ].includes(value),
  );

function openingHoursShape() {
  return z.object({
    monday: openingDaySchema,
    tuesday: openingDaySchema,
    wednesday: openingDaySchema,
    thursday: openingDaySchema,
    friday: openingDaySchema,
    saturday: openingDaySchema,
    sunday: openingDaySchema,
  });
}

const metricsSchema = z.object({
  elapsedMs: z.number().int().min(0).max(31_536_000_000),
  abandonCount: z.number().int().min(0).max(100_000),
  helpCount: z.number().int().min(0).max(100_000),
});

export const onboardingDraftSchema = z
  .object({
    category: z.enum(SHOP_CATEGORIES),
    name: z.string().trim().max(80),
    slug: z.union([shopSlugSchema, z.literal("")]),
    brandColor: z.string().max(7),
    logoPath: z.string().max(500).nullable(),
    whatsapp: z.string().max(20),
    phone: z.string().max(20),
    city: z.string().trim().max(80),
    district: z.string().trim().max(100),
    address: z.string().trim().max(300),
    openingHours: openingHoursShape(),
    lat: z.number().min(-90).max(90).nullable(),
    lng: z.number().min(-180).max(180).nullable(),
    metrics: z.object({
      steps: z.record(z.string(), metricsSchema),
    }),
    updatedAt: z.number().int().min(0),
  })
  .strict();

export const saveOnboardingSchema = z.object({
  currentStep: z.number().int().min(1).max(5),
  draft: onboardingDraftSchema,
});

export const initialOnboardingDraft = {
  category: "other",
  name: "",
  slug: "",
  brandColor: "#1F6FEB",
  logoPath: null,
  whatsapp: "",
  phone: "",
  city: "Ouagadougou",
  district: "",
  address: "",
  openingHours: {
    monday: { closed: true, opensAt: "", closesAt: "" },
    tuesday: { closed: true, opensAt: "", closesAt: "" },
    wednesday: { closed: true, opensAt: "", closesAt: "" },
    thursday: { closed: true, opensAt: "", closesAt: "" },
    friday: { closed: true, opensAt: "", closesAt: "" },
    saturday: { closed: true, opensAt: "", closesAt: "" },
    sunday: { closed: true, opensAt: "", closesAt: "" },
  },
  lat: null,
  lng: null,
  metrics: { steps: {} },
  updatedAt: 0,
} satisfies z.input<typeof onboardingDraftSchema>;

export type OnboardingDraft = z.infer<typeof onboardingDraftSchema>;
export type OnboardingCategory = (typeof SHOP_CATEGORIES)[number];
export const validShopSlugSchema = shopSlugSchema;
export const validPhoneSchema = z.string().regex(/^\+?[0-9]{8,15}$/);
export const validBrandColorSchema = z.string().regex(/^#[0-9A-Fa-f]{6}$/);

export function hasCompleteOpeningHours(
  hours: OnboardingDraft["openingHours"],
) {
  const days = Object.values(hours);

  return (
    days.some((day) => !day.closed) &&
    days.every(
      (day) =>
        day.closed ||
        (timeValueSchema.safeParse(day.opensAt).success &&
          timeValueSchema.safeParse(day.closesAt).success &&
          day.opensAt < day.closesAt),
    )
  );
}

export function createDefaultDraft(slug: string): OnboardingDraft {
  return onboardingDraftSchema.parse({
    ...initialOnboardingDraft,
    slug,
    updatedAt: Date.now(),
  });
}

export function addStepMetrics(
  draft: OnboardingDraft,
  step: number,
  elapsedMs: number,
  abandoned: boolean,
): OnboardingDraft {
  if (step < 1 || step > 4) {
    return draft;
  }

  const key = String(step);
  const metrics = draft.metrics.steps[key] ?? {
    elapsedMs: 0,
    abandonCount: 0,
    helpCount: 0,
  };

  return {
    ...draft,
    metrics: {
      steps: {
        ...draft.metrics.steps,
        [key]: {
          ...metrics,
          elapsedMs: metrics.elapsedMs + elapsedMs,
          abandonCount: metrics.abandonCount + (abandoned ? 1 : 0),
        },
      },
    },
  };
}
