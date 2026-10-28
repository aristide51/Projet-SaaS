import { describe, expect, it } from "vitest";
import { decodeShortProductId, encodeShortProductId } from "./short-links";

describe("short product links", () => {
  it("encodes and decodes UUIDs without changing their value", () => {
    const productId = "d9428888-122b-4a81-b8d0-9f8c13a42b91";
    const code = encodeShortProductId(productId);

    expect(code).toHaveLength(22);
    expect(decodeShortProductId(code!)).toBe(productId);
  });

  it("rejects malformed UUIDs and codes", () => {
    expect(encodeShortProductId("not-a-uuid")).toBeNull();
    expect(decodeShortProductId("bad-code")).toBeNull();
    expect(decodeShortProductId("AAAAAAAAAAAAAAAAAAAAAA")).toBeNull();
  });
});
