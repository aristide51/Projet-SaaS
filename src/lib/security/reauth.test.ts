import { describe, expect, it } from "vitest";
import {
  createReauthProof,
  isValidReauthProof,
  REAUTH_WINDOW_SECONDS,
} from "./reauth";

const secret = "test-secret-that-is-long-enough-for-signing";
const now = Date.UTC(2026, 9, 22, 16, 0);

describe("reauthentication proof", () => {
  it("accepts a proof for the same user within ten minutes", () => {
    const proof = createReauthProof("user-1", secret, now);

    expect(isValidReauthProof(proof, "user-1", secret, now + 599_000)).toBe(
      true,
    );
  });

  it("rejects a proof after ten minutes", () => {
    const proof = createReauthProof("user-1", secret, now);

    expect(
      isValidReauthProof(
        proof,
        "user-1",
        secret,
        now + REAUTH_WINDOW_SECONDS * 1000,
      ),
    ).toBe(false);
  });

  it("rejects proofs for another user or with a modified signature", () => {
    const proof = createReauthProof("user-1", secret, now);
    const tamperedProof = `${proof.slice(0, -1)}x`;

    expect(isValidReauthProof(proof, "user-2", secret, now)).toBe(false);
    expect(isValidReauthProof(tamperedProof, "user-1", secret, now)).toBe(
      false,
    );
  });
});
