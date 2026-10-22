import { afterEach, describe, expect, it, vi } from "vitest";
import { verifyTurnstileToken } from "@/lib/turnstile";

describe("verifyTurnstileToken", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("fails explicitly when the secret is not configured", async () => {
    vi.stubEnv("TURNSTILE_SECRET_KEY", "");

    await expect(verifyTurnstileToken("token")).rejects.toThrow(
      "La vérification Turnstile n’est pas configurée.",
    );
  });

  it("returns the verified result and sends the token to Cloudflare", async () => {
    vi.stubEnv("TURNSTILE_SECRET_KEY", "server-only-secret");
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ success: true }), { status: 200 }),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      verifyTurnstileToken("challenge-token", "192.0.2.10"),
    ).resolves.toBe(true);

    const [, request] = fetchMock.mock.calls[0] as [
      string,
      RequestInit & { body: URLSearchParams },
    ];
    expect(request.body.get("response")).toBe("challenge-token");
    expect(request.body.get("secret")).toBe("server-only-secret");
    expect(request.body.get("remoteip")).toBe("192.0.2.10");
  });
});
