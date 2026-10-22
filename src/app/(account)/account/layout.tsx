import type { ReactNode } from "react";
import { requireVerifiedUser } from "@/lib/auth/guards";

export default async function AccountLayout({
  children,
}: {
  children: ReactNode;
}) {
  await requireVerifiedUser();
  return children;
}
