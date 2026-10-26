import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { validateServerEnv } from "@/lib/env";
import type { Database } from "@/types/database";

export async function createClient() {
  const cookieStore = await cookies();
  const { NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY } =
    validateServerEnv();
  const secure = NEXT_PUBLIC_SUPABASE_URL.startsWith("https://");

  return createServerClient<Database>(
    NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookieOptions: {
        httpOnly: true,
        path: "/",
        sameSite: "lax",
        secure,
      },
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, {
                ...options,
                httpOnly: true,
                path: "/",
                sameSite: "lax",
                secure,
              });
            });
          } catch (error) {
            if (
              error instanceof Error &&
              error.message.includes(
                "Cookies can only be modified in a Server Action or Route Handler",
              )
            ) {
              return;
            }

            throw error;
          }
        },
      },
    },
  );
}

export async function getUser() {
  const user = await getOptionalUser();

  if (!user) {
    throw new Error("Impossible de récupérer l’utilisateur connecté.");
  }

  return user;
}

export async function getOptionalUser() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();

  if (error?.name === "AuthSessionMissingError") {
    return null;
  }

  if (error) {
    throw new Error("Impossible de récupérer l’utilisateur connecté.", {
      cause: error,
    });
  }

  return data.user;
}

export async function getSessionUser() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getSession();

  if (error) {
    throw new Error("Impossible de lire la session de l’utilisateur.", {
      cause: error,
    });
  }

  return data.session?.user ?? null;
}
