import type { ReactNode } from "react";
import Link from "next/link";
import { requireVerifiedUser } from "@/lib/auth/guards";

export default async function BookingsLayout({
  children,
}: {
  children: ReactNode;
}) {
  await requireVerifiedUser();
  return (
    <>
      <nav className="bookings-nav">
        <Link href="/dashboard/bookings" className="nav-link">
          Agenda et rendez-vous
        </Link>
      </nav>
      <main className="bookings-main">{children}</main>
    </>
  );
}
