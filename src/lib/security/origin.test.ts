import { describe, expect, it } from "vitest";
import { isSameOriginWrite } from "@/lib/security/origin";

function request(method: string, origin: string | null) {
  return {
    method,
    url: "https://faso.example/api/orders",
    headers: new Headers(origin ? { origin } : {}),
  };
}

describe("isSameOriginWrite", () => {
  it("allows same-origin writes and read-only requests", () => {
    expect(isSameOriginWrite(request("POST", "https://faso.example"))).toBe(
      true,
    );
    expect(isSameOriginWrite(request("GET", null))).toBe(true);
  });

  it("rejects a foreign or missing origin on write requests", () => {
    expect(isSameOriginWrite(request("POST", "https://evil.example"))).toBe(
      false,
    );
    expect(isSameOriginWrite(request("POST", null))).toBe(false);
  });
});
