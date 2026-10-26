import type { ReactNode } from "react";
import { NotificationCenter } from "@/features/notifications/notification-center";
import { requireVerifiedUser } from "@/lib/auth/guards";

export default async function DashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  const user = await requireVerifiedUser();
  return (
    <>
      <div className="app-notification-bar">
        <NotificationCenter userId={user.id} />
      </div>
      {children}
    </>
  );
}
