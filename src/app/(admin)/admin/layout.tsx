import type { ReactNode } from "react";
import { requireAdminUser } from "@/lib/auth/guards";

export default async function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  await requireAdminUser();
  return children;
}
