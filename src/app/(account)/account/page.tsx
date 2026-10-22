import { getUser } from "@/lib/supabase/server";
import { SignOutButton } from "@/features/auth/sign-out-button";

export default async function AccountPage() {
  const user = await getUser();

  return (
    <main className="auth-main">
      <section className="auth-card">
        <p className="auth-eyebrow">Mon compte</p>
        <h1>Bienvenue</h1>
        <p>Connecté avec {user.email}</p>
        <SignOutButton />
      </section>
    </main>
  );
}
