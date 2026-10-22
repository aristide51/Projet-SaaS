import { describe, expect, it } from "vitest";
import {
  normalizeBurkinaPhone,
  phoneOnlySchema,
  profileSchema,
} from "./schemas";

describe("normalizeBurkinaPhone", () => {
  it.each([
    ["70 00 00 00", "+22670000000"],
    ["+226 70 00 00 00", "+22670000000"],
    ["22670000000", "+22670000000"],
    ["00226 70-00-00-00", "+22670000000"],
  ])("normalizes %s", (input, expected) => {
    expect(normalizeBurkinaPhone(input)).toBe(expected);
  });

  it.each(["7000000", "700000000", "+33123456789", "2267000000"])(
    "rejects %s",
    (input) => {
      expect(normalizeBurkinaPhone(input)).toBeUndefined();
    },
  );

  it("allows an empty profile phone but requires it in the purchase gate", () => {
    expect(
      profileSchema.safeParse({ fullName: "Awa Test", phone: "" }).success,
    ).toBe(true);
    expect(phoneOnlySchema.safeParse({ phone: "" }).success).toBe(false);
  });
});
