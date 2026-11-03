import type { ReactNode } from "react";
import { BrandUtilityBar } from "@/components/design/brand-utility-bar";
import { SiteShell } from "@/components/design/site-shell";
import { WorkspaceTopbar } from "@/components/workspace-topbar";
import { requireVerifiedUser } from "@/lib/auth/guards";
import "./account-page.css";

export default async function AccountLayout({
  children,
}: {
  children: ReactNode;
}) {
  await requireVerifiedUser();
  return (
    <SiteShell>
      <div className="workspace-layout workspace-layout--account">
        <BrandUtilityBar />
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
    </SiteShell>
  );
}
