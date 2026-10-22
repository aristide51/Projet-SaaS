import { describe, expect, it } from "vitest";
import { getRequestOrigin, isSameOriginWrite } from "@/lib/security/origin";

function request(
  method: string,
  origin: string | null,
  headers: Record<string, string> = { host: "faso.example" },
) {
  return {
    method,
    url: "https://faso.example/api/orders",
    headers: new Headers({ ...headers, ...(origin ? { origin } : {}) }),
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

  it("compares against the externally forwarded host", () => {
    const forwardedRequest = request("POST", "http://shop.example", {
      host: "127.0.0.1:3000",
      "x-forwarded-host": "shop.example",
      "x-forwarded-proto": "http",
    });

    expect(getRequestOrigin(forwardedRequest)).toBe("http://shop.example");
    expect(isSameOriginWrite(forwardedRequest)).toBe(true);
    expect(
      isSameOriginWrite(
        request("POST", "http://evil.example", {
          host: "127.0.0.1:3000",
          "x-forwarded-host": "shop.example",
          "x-forwarded-proto": "http",
        }),
      ),
    ).toBe(false);
  });
});
