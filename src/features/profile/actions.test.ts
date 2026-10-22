import { afterEach, describe, expect, it, vi } from "vitest";

const { createClient, getUser, hasRecentReauthentication } = vi.hoisted(() => ({
  createClient: vi.fn(),
  getUser: vi.fn(),
  hasRecentReauthentication: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient,
  getUser,
}));

vi.mock("@/lib/security/reauth", () => ({
  clearReauthProof: vi.fn(),
  hasRecentReauthentication,
}));

vi.mock("@/lib/monitoring/sentry", () => ({
  logError: vi.fn(),
}));

import { requestAccountDeletion } from "./actions";

describe("requestAccountDeletion", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("refuses the server action without recent reauthentication", async () => {
    getUser.mockResolvedValue({
      id: "user-1",
      email_confirmed_at: "2026-10-22T16:00:00.000Z",
    });
    hasRecentReauthentication.mockResolvedValue(false);

    await expect(requestAccountDeletion()).resolves.toEqual({
      success: false,
      message:
        "Confirme à nouveau ton identité avant de demander la suppression.",
    });
    expect(createClient).not.toHaveBeenCalled();
  });
});
