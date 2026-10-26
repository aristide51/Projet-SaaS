import { afterEach, describe, expect, it, vi } from "vitest";

const { browserClientFactory, serverClientFactory, cookieStore } = vi.hoisted(
  () => ({
    browserClientFactory: vi.fn(),
    serverClientFactory: vi.fn(),
    cookieStore: {
      getAll: vi.fn(() => []),
      set: vi.fn(),
    },
  }),
);

vi.mock("@supabase/ssr", () => ({
  createBrowserClient: browserClientFactory,
  createServerClient: serverClientFactory,
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => cookieStore),
}));

import { createClient as createBrowserClient } from "@/lib/supabase/client";
import {
  createClient as createServerClient,
  getOptionalUser,
} from "@/lib/supabase/server";

describe("clients Supabase", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it("configure le client navigateur sans session persistante", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:55421");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "local-anon-key");

    createBrowserClient();

    expect(browserClientFactory).toHaveBeenCalledWith(
      "http://127.0.0.1:55421",
      "local-anon-key",
      expect.objectContaining({
        auth: expect.objectContaining({ persistSession: false }),
      }),
    );
  });

  it("configure le client serveur avec les variables publiques et les cookies", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:55421");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "local-anon-key");

    await createServerClient();

    expect(serverClientFactory).toHaveBeenCalledWith(
      "http://127.0.0.1:55421",
      "local-anon-key",
      expect.objectContaining({
        cookieOptions: expect.objectContaining({ httpOnly: true }),
        cookies: expect.objectContaining({
          getAll: expect.any(Function),
          setAll: expect.any(Function),
        }),
      }),
    );
  });

  it("traite une session absente comme un visiteur anonyme", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:55421");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "local-anon-key");
    serverClientFactory.mockReturnValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: null },
          error: { name: "AuthSessionMissingError" },
        }),
      },
    });

    await expect(getOptionalUser()).resolves.toBeNull();
  });
});
