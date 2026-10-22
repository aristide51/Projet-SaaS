import { describe, expect, it } from "vitest";
import { getProtectedArea, getSafeRedirectPath } from "@/lib/auth/redirect";

describe("getSafeRedirectPath", () => {
  it("keeps safe local paths and query strings", () => {
    expect(getSafeRedirectPath("/dashboard?tab=orders")).toBe(
      "/dashboard?tab=orders",
    );
  });

  it("rejects external, protocol-relative, and auth-loop paths", () => {
    expect(getSafeRedirectPath("https://evil.example")).toBe("/account");
    expect(getSafeRedirectPath("//evil.example")).toBe("/account");
    expect(getSafeRedirectPath("/auth/callback")).toBe("/account");
  });
});

describe("getProtectedArea", () => {
  it("requires authentication for account and dashboard and admin for admin", () => {
    expect(getProtectedArea("/account/orders")).toBe("authenticated");
    expect(getProtectedArea("/dashboard")).toBe("authenticated");
    expect(getProtectedArea("/admin/shops")).toBe("admin");
    expect(getProtectedArea("/")).toBeNull();
  });
});
