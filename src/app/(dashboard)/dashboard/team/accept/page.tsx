import { AcceptInvitation } from "@/features/team/accept-invitation";
import { requireVerifiedUser } from "@/lib/auth/guards";

type AcceptInvitationPageProps = {
  searchParams: Promise<{ token?: string }>;
};

export default async function AcceptInvitationPage({
  searchParams,
}: AcceptInvitationPageProps) {
  await requireVerifiedUser();
  const { token } = await searchParams;

  return (
    <main className="team-shell">
      <AcceptInvitation token={token ?? ""} />
    </main>
  );
}
