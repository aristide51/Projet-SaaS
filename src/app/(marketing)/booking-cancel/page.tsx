import { redirect } from "next/navigation";
import type { Metadata } from "next";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

type BookingCancelPageProps = {
  searchParams: Promise<{ token?: string }>;
};

export default async function BookingCancelPage({
  searchParams,
}: BookingCancelPageProps) {
  const { token } = await searchParams;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!token || token.length > 2_048 || !supabaseUrl) {
    redirect("/account/bookings");
  }

  return (
    <main className="auth-page">
      <section className="auth-card" aria-labelledby="booking-cancel-title">
        <h1 id="booking-cancel-title">Annuler ce rendez-vous ?</h1>
        <p>
          Confirme pour annuler. L’ouverture de ce lien ne modifie pas ta
          réservation.
        </p>
        <form
          action={`${supabaseUrl}/functions/v1/booking-cancel`}
          method="post"
        >
          <input name="token" type="hidden" value={token} />
          <button className="ui-button ui-button--danger" type="submit">
            Confirmer l’annulation
          </button>
        </form>
      </section>
    </main>
  );
}
