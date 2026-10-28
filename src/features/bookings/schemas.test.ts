import { describe, expect, it } from "vitest";
import {
  availabilityRulesSchema,
  serviceSchema,
  timeOffSchema,
} from "./schemas";

const shopId = "51000000-0000-4000-8000-000000000001";
const resourceId = "61000000-0000-4000-8000-000000000001";

describe("schemas de rendez-vous", () => {
  it("accepte des plages séparées et refuse les chevauchements", () => {
    const rules = [
      {
        shop_id: shopId,
        resource_id: resourceId,
        weekday: 1,
        start_time: "08:00",
        end_time: "12:00",
      },
      {
        shop_id: shopId,
        resource_id: resourceId,
        weekday: 1,
        start_time: "14:00",
        end_time: "18:00",
      },
    ];

    expect(availabilityRulesSchema.safeParse(rules).success).toBe(true);
    expect(
      availabilityRulesSchema.safeParse([
        ...rules,
        { ...rules[1], start_time: "11:00", end_time: "15:00" },
      ]).success,
    ).toBe(false);
  });

  it("refuse un acompte supérieur au prix du service", () => {
    expect(
      serviceSchema.safeParse({
        shop_id: shopId,
        name: "Diagnostic",
        duration_min: 30,
        price: 5000,
        deposit_amount: 5001,
      }).success,
    ).toBe(false);
  });

  it("valide les fermetures avec horodatage UTC explicite", () => {
    expect(
      timeOffSchema.safeParse({
        shop_id: shopId,
        resource_id: null,
        starts_at: "2026-12-01T00:00:00Z",
        ends_at: "2026-12-01T23:59:00Z",
        reason: "Jour férié",
      }).success,
    ).toBe(true);
  });
});
