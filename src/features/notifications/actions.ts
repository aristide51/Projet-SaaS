"use server";

import { z } from "zod";
import { requireVerifiedUser } from "@/lib/auth/guards";
import { logError } from "@/lib/monitoring/sentry";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

const PAGE_SIZE = 20;
const notificationIdSchema = z.string().uuid();

export type AppNotification =
  Database["public"]["Tables"]["notifications"]["Row"];

export type NotificationPage = {
  items: AppNotification[];
  unreadCount: number;
  hasMore: boolean;
};

export async function getMyNotifications(
  requestedOffset = 0,
): Promise<NotificationPage> {
  const user = await requireVerifiedUser();
  const offset = Number.isSafeInteger(requestedOffset)
    ? Math.max(0, requestedOffset)
    : 0;
  const supabase = await createClient();
  const [notificationsResult, unreadResult] = await Promise.all([
    supabase
      .from("notifications")
      .select("id, user_id, type, payload, read_at, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .range(offset, offset + PAGE_SIZE),
    supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .is("read_at", null),
  ]);
  const queryError = notificationsResult.error ?? unreadResult.error;
  if (queryError) {
    await logError("notifications_list_failed", queryError);
    throw new Error("Impossible de charger tes notifications.", {
      cause: queryError,
    });
  }

  const rows = notificationsResult.data ?? [];
  const hasMore = rows.length > PAGE_SIZE;
  return {
    items: hasMore ? rows.slice(0, PAGE_SIZE) : rows,
    unreadCount: unreadResult.count ?? 0,
    hasMore,
  };
}

export async function markNotificationAsRead(
  notificationId: string,
): Promise<{ success: boolean; message: string }> {
  if (!notificationIdSchema.safeParse(notificationId).success) {
    return {
      success: false,
      message: "Cette notification n’est pas valide.",
    };
  }

  try {
    const user = await requireVerifiedUser();
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("id", notificationId)
      .eq("user_id", user.id)
      .is("read_at", null)
      .select("id")
      .maybeSingle();

    if (error) {
      await logError("notifications_mark_read_failed", error);
      return {
        success: false,
        message: "La notification n’a pas pu être marquée comme lue.",
      };
    }
    if (!data) {
      return {
        success: false,
        message: "Cette notification est introuvable ou déjà lue.",
      };
    }

    return { success: true, message: "Notification marquée comme lue." };
  } catch (error) {
    await logError("notifications_mark_read_failed", error);
    return {
      success: false,
      message: "La notification n’a pas pu être marquée comme lue.",
    };
  }
}
