import { z } from "zod";

export const TEAM_PERMISSIONS = [
  { key: "catalog", label: "Catalogue" },
  { key: "orders", label: "Commandes" },
  { key: "bookings", label: "Rendez-vous" },
  { key: "promotions", label: "Promotions" },
  { key: "reviews", label: "Avis" },
  { key: "settings", label: "Réglages" },
  { key: "payments", label: "Paiements" },
] as const;

export const teamPermissionsSchema = z
  .object({
    catalog: z.boolean(),
    orders: z.boolean(),
    bookings: z.boolean(),
    promotions: z.boolean(),
    reviews: z.boolean(),
    settings: z.boolean(),
    payments: z.boolean(),
  })
  .strict();

export type TeamPermissions = z.infer<typeof teamPermissionsSchema>;

export const emptyTeamPermissions: TeamPermissions = {
  catalog: false,
  orders: false,
  bookings: false,
  promotions: false,
  reviews: false,
  settings: false,
  payments: false,
};

export function parseTeamPermissions(value: unknown): TeamPermissions {
  const parsed = teamPermissionsSchema.partial().safeParse(value);
  if (!parsed.success) return emptyTeamPermissions;
  return {
    catalog: parsed.data.catalog ?? false,
    orders: parsed.data.orders ?? false,
    bookings: parsed.data.bookings ?? false,
    promotions: parsed.data.promotions ?? false,
    reviews: parsed.data.reviews ?? false,
    settings: parsed.data.settings ?? false,
    payments: parsed.data.payments ?? false,
  };
}
