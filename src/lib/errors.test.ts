import { describe, expect, it } from "vitest";
import { getAuthErrorMessage } from "@/lib/errors";

describe("getAuthErrorMessage", () => {
  it("maps provider errors to clear French messages", () => {
    expect(getAuthErrorMessage({ code: "invalid_credentials" })).toBe(
      "Adresse e-mail ou mot de passe incorrect.",
    );
    expect(getAuthErrorMessage({ code: "email_not_confirmed" })).toBe(
      "Confirme ton adresse e-mail avant de te connecter.",
    );
  });

  it("does not expose unknown provider details", () => {
    expect(
      getAuthErrorMessage({
        message: "Database connection failed: secret token",
      }),
    ).toContain("Une erreur est survenue");
    expect(
      getAuthErrorMessage({
        message: "Database connection failed: secret token",
      }),
    ).not.toContain("secret token");
  });
});
