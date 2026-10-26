import { getMyNotifications } from "./actions";
import { NotificationCenterClient } from "./notification-center-client";

export async function NotificationCenter({ userId }: { userId: string }) {
  const page = await getMyNotifications(0);
  return (
    <NotificationCenterClient initialPage={page} key={userId} userId={userId} />
  );
}
