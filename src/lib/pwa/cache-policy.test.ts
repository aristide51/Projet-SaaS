import { describe, expect, it } from "vitest";
import { isPublicPwaPath, shouldMarkPublicPwaResponse } from "./cache-policy";

describe("public PWA cache policy", () => {
  it("allows only public marketing, shop, and valid product routes", () => {
    expect(isPublicPwaPath("/")).toBe(true);
    expect(isPublicPwaPath("/shops")).toBe(true);
    expect(isPublicPwaPath("/quincaillerie-central")).toBe(true);
    expect(
      isPublicPwaPath(
        "/quincaillerie-central/products/b0000000-0000-4000-8000-000000000001",
      ),
    ).toBe(true);
  });

  it("rejects account, payment, action, and invalid product routes", () => {
    expect(isPublicPwaPath("/dashboard")).toBe(false);
    expect(isPublicPwaPath("/account")).toBe(false);
    expect(isPublicPwaPath("/auth/login")).toBe(false);
    expect(isPublicPwaPath("/quincaillerie-central/checkout")).toBe(false);
    expect(isPublicPwaPath("/quincaillerie-central/payment/order")).toBe(false);
    expect(
      isPublicPwaPath(
        "/quincaillerie-central/products/b0000000-0000-0000-0000-000000000001",
      ),
    ).toBe(false);
  });

  it("marks only anonymous GET navigations as safe for public-page caching", () => {
    expect(
      shouldMarkPublicPwaResponse("GET", "/quincaillerie-central", null),
    ).toBe(true);
    expect(
      shouldMarkPublicPwaResponse("POST", "/quincaillerie-central", null),
    ).toBe(false);
    expect(
      shouldMarkPublicPwaResponse(
        "GET",
        "/quincaillerie-central",
        "sb-access-token=private",
      ),
    ).toBe(false);
    expect(shouldMarkPublicPwaResponse("GET", "/dashboard", null)).toBe(false);
  });
});
