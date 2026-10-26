import { describe, expect, it } from "vitest";
import { SAMPLE_CATALOGS, SAMPLE_SHOP_TYPES } from "./sample-products";

describe("sample catalog data", () => {
  it("provides products or services for each supported business type", () => {
    expect(Object.keys(SAMPLE_CATALOGS).sort()).toEqual(
      [...SAMPLE_SHOP_TYPES].sort(),
    );

    for (const catalog of Object.values(SAMPLE_CATALOGS)) {
      expect(catalog.products.length + catalog.services.length).toBeGreaterThan(
        0,
      );
      expect(
        [...catalog.products, ...catalog.services].every(
          (entry) => entry.name.trim().length > 0,
        ),
      ).toBe(true);
    }
  });
});
