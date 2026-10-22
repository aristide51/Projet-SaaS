import type { ReactNode } from "react";
import { requireVerifiedUser } from "@/lib/auth/guards";

export default async function DashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  await requireVerifiedUser();
  return children;
}
