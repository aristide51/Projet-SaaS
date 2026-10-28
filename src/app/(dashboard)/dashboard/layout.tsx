import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { NotificationCenter } from "@/features/notifications/notification-center";
import { PwaStatus } from "@/features/pwa/pwa-status";
import { requireVerifiedUser } from "@/lib/auth/guards";

export const metadata: Metadata = {
  applicationName: "Boutiques locales",
  manifest: "/pwa-manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Boutiques",
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#155d42",
};

export default async function DashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  const user = await requireVerifiedUser();
  return (
    <>
      <PwaStatus showInstall />
      <div className="app-notification-bar">
        <NotificationCenter userId={user.id} />
      </div>
      {children}
    </>
  );
}
