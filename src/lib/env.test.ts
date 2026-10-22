import { describe, expect, it } from "vitest";
import { validateServerEnv } from "@/lib/env";

describe("validateServerEnv", () => {
  it("accepts a valid Supabase configuration", () => {
    expect(
      validateServerEnv({
        NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
        NEXT_PUBLIC_SUPABASE_ANON_KEY: "public-anon-key",
      }),
    ).toEqual({
      NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "public-anon-key",
    });
  });

  it("accepts blank optional security integrations", () => {
    expect(
      validateServerEnv({
        NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
        NEXT_PUBLIC_SUPABASE_ANON_KEY: "public-anon-key",
        NEXT_PUBLIC_SENTRY_DSN: "",
        TURNSTILE_SECRET_KEY: "",
      }),
    ).toMatchObject({
      NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "public-anon-key",
      NEXT_PUBLIC_SENTRY_DSN: "",
      TURNSTILE_SECRET_KEY: "",
    });
  });

  it("reports missing variables without exposing their values", () => {
    expect(() =>
      validateServerEnv({
        NEXT_PUBLIC_SUPABASE_URL: "not-a-url",
        NEXT_PUBLIC_SUPABASE_ANON_KEY: "",
      }),
    ).toThrow(
      "Configuration invalide : NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY.",
    );
  });
});
