import type { ReactNode } from "react";
import { WorkspaceTopbar } from "@/components/workspace-topbar";
import { requireVerifiedUser } from "@/lib/auth/guards";

export default async function AccountLayout({
  children,
}: {
  children: ReactNode;
}) {
  await requireVerifiedUser();
  return (
    <div className="workspace-layout">
      <WorkspaceTopbar
        links={[
          { href: "/account", label: "Mon profil" },
          { href: "/account/bookings", label: "Mes rendez-vous" },
          { href: "/shops", label: "Annuaire" },
        ]}
        section="Espace client"
      />
      {children}
    </div>
  );
}
