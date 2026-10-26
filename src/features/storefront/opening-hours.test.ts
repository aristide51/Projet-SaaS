import { describe, expect, it } from "vitest";
import { getOpeningHoursList, getOpeningStatus } from "./opening-hours";

const hours = {
  monday: { closed: false, opensAt: "08:00", closesAt: "17:00" },
  tuesday: { closed: true, opensAt: "", closesAt: "" },
  wednesday: { closed: false, opensAt: "08:00", closesAt: "17:00" },
  thursday: { closed: false, opensAt: "08:00", closesAt: "17:00" },
  friday: { closed: false, opensAt: "08:00", closesAt: "17:00" },
  saturday: { closed: false, opensAt: "08:00", closesAt: "12:00" },
  sunday: { closed: true, opensAt: "", closesAt: "" },
};

describe("storefront opening hours", () => {
  it("uses the Ouagadougou local day and opening interval", () => {
    expect(
      getOpeningStatus(hours, new Date("2026-10-26T08:00:00.000Z")),
    ).toEqual({
      isOpen: true,
      label: "Ouvert maintenant",
    });
    expect(
      getOpeningStatus(hours, new Date("2026-10-26T17:00:00.000Z")),
    ).toEqual({
      isOpen: false,
      label: "Fermé maintenant",
    });
  });

  it("treats closed and malformed days as closed", () => {
    expect(
      getOpeningStatus(hours, new Date("2026-10-27T10:00:00.000Z")),
    ).toEqual({
      isOpen: false,
      label: "Fermé maintenant",
    });
    expect(getOpeningStatus({}, new Date("2026-10-26T10:00:00.000Z"))).toEqual({
      isOpen: false,
      label: "Fermé maintenant",
    });
  });

  it("returns the weekly schedule in French", () => {
    expect(getOpeningHoursList(hours)[0]).toEqual({
      label: "Lundi",
      value: "08:00 – 17:00",
    });
  });
});
