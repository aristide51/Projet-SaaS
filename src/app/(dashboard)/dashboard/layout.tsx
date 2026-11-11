import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { SiteShell } from "@/components/design/site-shell";
import { WorkspaceTopbar } from "@/components/workspace-topbar";
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
  themeColor: "#08782f",
};

export default async function DashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  const user = await requireVerifiedUser();
  return (
    <SiteShell>
      <div className="workspace-layout">
        <PwaStatus showInstall />
        <WorkspaceTopbar
          links={[
            { href: "/dashboard", label: "Mon espace" },
            { href: "/shops", label: "Annuaire" },
            { href: "/account", label: "Mon compte" },
          ]}
          section="Espace commerçant"
        />
        <div className="app-notification-bar">
          <NotificationCenter userId={user.id} />
        </div>
        {children}
      </div>
    </SiteShell>
  );
}
