import { afterEach, describe, expect, it, vi } from "vitest";

const { createClient, requireVerifiedUser, logError } = vi.hoisted(() => ({
  createClient: vi.fn(),
  requireVerifiedUser: vi.fn(),
  logError: vi.fn(),
}));

vi.mock("@/lib/auth/guards", () => ({ requireVerifiedUser }));
vi.mock("@/lib/supabase/server", () => ({ createClient }));
vi.mock("@/lib/monitoring/sentry", () => ({ logError }));

import { getMyNotifications, markNotificationAsRead } from "./actions";

const userId = "00000000-0000-4000-8000-000000000001";
const notificationId = "00000000-0000-4000-8000-000000000002";

describe("in-app notification actions", () => {
  afterEach(() => vi.clearAllMocks());

  it("rejects invalid notification ids without creating a database client", async () => {
    await expect(markNotificationAsRead("invalid")).resolves.toEqual({
      success: false,
      message: "Cette notification n’est pas valide.",
    });
    expect(requireVerifiedUser).not.toHaveBeenCalled();
    expect(createClient).not.toHaveBeenCalled();
  });

  it("loads one user's notifications with bounded pagination and unread count", async () => {
    const notificationsQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      range: vi.fn().mockResolvedValue({
        data: [
          {
            id: notificationId,
            user_id: userId,
            type: "shop_review",
            payload: { approved: true },
            read_at: null,
            created_at: "2026-10-23T00:00:00Z",
          },
        ],
        error: null,
      }),
    };
    const unreadQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      is: vi.fn().mockResolvedValue({ count: 3, error: null }),
    };
    const from = vi
      .fn()
      .mockReturnValueOnce(notificationsQuery)
      .mockReturnValueOnce(unreadQuery);
    requireVerifiedUser.mockResolvedValue({ id: userId });
    createClient.mockResolvedValue({ from });

    const result = await getMyNotifications(20);

    expect(from).toHaveBeenCalledTimes(2);
    expect(notificationsQuery.eq).toHaveBeenCalledWith("user_id", userId);
    expect(notificationsQuery.range).toHaveBeenCalledWith(20, 40);
    expect(unreadQuery.eq).toHaveBeenCalledWith("user_id", userId);
    expect(result).toMatchObject({
      items: [{ id: notificationId }],
      unreadCount: 3,
      hasMore: false,
    });
  });

  it("updates read_at only for the authenticated user's unread notification", async () => {
    const query = {
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: { id: notificationId },
        error: null,
      }),
    };
    requireVerifiedUser.mockResolvedValue({ id: userId });
    createClient.mockResolvedValue({ from: vi.fn(() => query) });

    await expect(markNotificationAsRead(notificationId)).resolves.toEqual({
      success: true,
      message: "Notification marquée comme lue.",
    });
    expect(query.update).toHaveBeenCalledWith({
      read_at: expect.any(String),
    });
    expect(query.eq).toHaveBeenCalledWith("user_id", userId);
    expect(query.is).toHaveBeenCalledWith("read_at", null);
  });
});
