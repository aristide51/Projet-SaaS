import { z } from "zod";

// ---------- Horaires hebdomadaires (availability_rules) ----------
export const availabilityRuleSchema = z
  .object({
    id: z.string().uuid().optional(),
    shop_id: z.string().uuid(),
    resource_id: z.string().uuid(),
    weekday: z.number().int().min(0).max(6), // 0 = dimanche
    start_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, {
      message: "heure au format HH:MM",
    }),
    end_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, {
      message: "heure au format HH:MM",
    }),
  })
  .strict()
  .refine((data) => data.end_time > data.start_time, {
    message: "l'heure de fin doit être après l'heure de début",
    path: ["end_time"],
  });

export type AvailabilityRuleInput = z.infer<typeof availabilityRuleSchema>;

export const availabilityRulesSchema = z
  .array(availabilityRuleSchema)
  .max(200)
  .refine(
    (rules) =>
      rules.every((rule, index) =>
        rules.every((other, otherIndex) => {
          if (
            index === otherIndex ||
            rule.resource_id !== other.resource_id ||
            rule.weekday !== other.weekday
          ) {
            return true;
          }
          return (
            rule.end_time <= other.start_time ||
            other.end_time <= rule.start_time
          );
        }),
      ),
    { message: "Deux plages horaires ne peuvent pas se chevaucher." },
  );

// ---------- Fermetures exceptionnelles (time_off) ----------
export const timeOffSchema = z
  .object({
    id: z.string().uuid().optional(),
    shop_id: z.string().uuid(),
    resource_id: z.string().uuid().optional().nullable(), // null = toute la boutique
    starts_at: z.string().datetime(),
    ends_at: z.string().datetime(),
    reason: z.string().max(200).optional(),
  })
  .strict()
  .refine((data) => data.ends_at > data.starts_at, {
    message: "la date de fin doit être après la date de début",
    path: ["ends_at"],
  });

export type TimeOffInput = z.infer<typeof timeOffSchema>;

// ---------- Ressources / employés ----------
export const resourceSchema = z
  .object({
    id: z.string().uuid().optional(),
    shop_id: z.string().uuid(),
    name: z.string().trim().min(1).max(80),
    active: z.boolean().default(true),
  })
  .strict();

export type ResourceInput = z.infer<typeof resourceSchema>;

// ---------- Services ----------
export const serviceSchema = z
  .object({
    id: z.string().uuid().optional(),
    shop_id: z.string().uuid(),
    name: z.string().trim().min(1).max(100),
    description: z.string().trim().max(500).optional().nullable(),
    duration_min: z.number().int().min(5).max(480),
    price: z.number().int().min(0),
    deposit_amount: z.number().int().min(0).default(0),
    active: z.boolean().default(true),
  })
  .strict()
  .refine((data) => data.deposit_amount <= data.price, {
    message: "L’acompte ne peut pas dépasser le prix du service.",
    path: ["deposit_amount"],
  });

export type ServiceInput = z.infer<typeof serviceSchema>;

// ---------- Reglages rendez-vous (shop_settings) ----------
export const shopSettingsSchema = z
  .object({
    shop_id: z.string().uuid(),
    booking_min_notice_hours: z.number().int().min(0).max(720), // max 30 jours
    booking_auto_confirm: z.boolean().default(false),
    booking_cancel_before_hours: z.number().int().min(0).max(720),
  })
  .strict();

export type ShopSettingsInput = z.infer<typeof shopSettingsSchema>;
