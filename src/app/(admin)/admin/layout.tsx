import type { ReactNode } from "react";
import { SiteShell } from "@/components/design/site-shell";
import { WorkspaceTopbar } from "@/components/workspace-topbar";
import { requireAdminUser } from "@/lib/auth/guards";

export default async function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  await requireAdminUser();
  return (
    <SiteShell>
      <div className="workspace-layout">
        <WorkspaceTopbar
          links={[
            { href: "/admin", label: "Modération" },
            { href: "/admin/review-reports", label: "Signalements" },
            { href: "/dashboard", label: "Espace commerçant" },
          ]}
          section="Administration"
        />
        {children}
      </div>
    </SiteShell>
  );
}
