import { afterEach, describe, expect, it, vi } from "vitest";

const { serverClientFactory } = vi.hoisted(() => ({
  serverClientFactory: vi.fn(),
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: serverClientFactory,
}));

import { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

describe("mise à jour de la session Supabase", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it("laisse les pages publiques accessibles avec un jeton de rafraîchissement invalide", async () => {
    configureSupabase();
    const getUser = vi.fn();
    serverClientFactory.mockReturnValue({
      auth: {
        getClaims: vi.fn().mockResolvedValue({
          data: null,
          error: { code: "refresh_token_not_found" },
        }),
        getUser,
      },
    });

    const request = new NextRequest("http://localhost/", {
      headers: { cookie: "sb-local-auth-token=expired" },
    });
    const response = await updateSession(request);

    expect(response.status).toBe(200);
    expect(response.cookies.get("sb-local-auth-token")?.value).toBe("");
    expect(request.cookies.getAll()).toEqual([]);
    expect(getUser).not.toHaveBeenCalled();
  });

  it("redirige les routes protégées vers la connexion et supprime le jeton invalide", async () => {
    configureSupabase();
    const getUser = vi.fn();
    serverClientFactory.mockReturnValue({
      auth: {
        getClaims: vi.fn().mockResolvedValue({
          data: null,
          error: { code: "refresh_token_not_found" },
        }),
        getUser,
      },
    });

    const response = await updateSession(
      new NextRequest("http://localhost/dashboard", {
        headers: { cookie: "sb-local-auth-token=expired" },
      }),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("/auth/login");
    expect(response.cookies.get("sb-local-auth-token")?.value).toBe("");
    expect(getUser).not.toHaveBeenCalled();
  });

  it("continue de signaler les erreurs Supabase autres qu'un jeton invalide", async () => {
    configureSupabase();
    const networkError = { code: "request_timeout" };
    serverClientFactory.mockReturnValue({
      auth: {
        getClaims: vi.fn().mockResolvedValue({
          data: null,
          error: networkError,
        }),
      },
    });

    await expect(
      updateSession(new NextRequest("http://localhost/")),
    ).rejects.toMatchObject({
      message: "Impossible de vérifier la session Supabase.",
      cause: networkError,
    });
  });
});

function configureSupabase() {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:55421");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "local-anon-key");
}
