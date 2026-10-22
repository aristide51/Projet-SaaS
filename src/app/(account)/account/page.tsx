import { getUser } from "@/lib/supabase/server";
import { SignOutButton } from "@/features/auth/sign-out-button";
import { ProfileForm } from "@/features/profile/profile-form";
import { createClient } from "@/lib/supabase/server";
import { hasRecentReauthentication } from "@/lib/security/reauth";

export default async function AccountPage() {
  const user = await getUser();
  const supabase = await createClient();
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("full_name, phone, avatar_url")
    .eq("id", user.id)
    .single();

  if (error) {
    throw new Error("Impossible de charger le profil.", { cause: error });
  }

  const reauthVerified = await hasRecentReauthentication(user.id);

  return (
    <main className="auth-main">
      <section className="auth-card profile-card">
        <p className="auth-eyebrow">Mon compte</p>
        <h1>Mon profil</h1>
        <p className="auth-description">Connecté avec {user.email}</p>
        <ProfileForm
          avatarUrl={profile.avatar_url}
          fullName={profile.full_name ?? ""}
          phone={profile.phone ?? ""}
          reauthVerified={reauthVerified}
        />
        <SignOutButton />
      </section>
    </main>
  );
}
