import type { ReactNode } from "react";
import { WorkspaceTopbar } from "@/components/workspace-topbar";
import { requireAdminUser } from "@/lib/auth/guards";

export default async function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  await requireAdminUser();
  return (
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
  );
}
