import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getSafeRedirectPath } from "@/lib/auth/redirect";
import { createClient, getUser } from "@/lib/supabase/server";

export async function requireVerifiedUser() {
  const user = await getUser();

  if (!user || !user.email_confirmed_at) {
    const requestHeaders = await headers();
    const currentPath = requestHeaders.get("x-current-path");
    const next = getSafeRedirectPath(currentPath);
    redirect(`/auth/login?next=${encodeURIComponent(next)}`);
  }

  return user;
}

export async function requireAdminUser() {
  const user = await requireVerifiedUser();
  const supabase = await createClient();
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("role_global")
    .eq("id", user.id)
    .maybeSingle();

  if (error) {
    throw new Error("Impossible de vérifier le rôle administrateur.", {
      cause: error,
    });
  }

  if (profile?.role_global !== "admin") {
    redirect("/account?error=access-denied");
  }

  return user;
}
