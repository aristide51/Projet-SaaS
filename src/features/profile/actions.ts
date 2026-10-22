"use server";

import { logError } from "@/lib/monitoring/sentry";
import {
  clearReauthProof,
  hasRecentReauthentication,
} from "@/lib/security/reauth";
import { createClient, getUser } from "@/lib/supabase/server";
import { phoneOnlySchema, profileSchema } from "./schemas";

const AVATAR_BUCKET = "profile-avatars";
const MAX_AVATAR_SIZE = 2 * 1024 * 1024;

export type ProfileActionResult =
  | { success: true; message: string; phone?: string }
  | { success: false; message: string };

function failure(message: string): ProfileActionResult {
  return { success: false, message };
}

export async function saveProfilePhone(
  formData: FormData,
): Promise<ProfileActionResult> {
  const parsed = phoneOnlySchema.safeParse({
    phone: formData.get("phone"),
  });

  if (!parsed.success) {
    return failure(parsed.error.issues[0]?.message ?? "Vérifie le numéro.");
  }

  try {
    const user = await getUser();

    if (!user?.email_confirmed_at) {
      return failure("Connecte-toi avec une adresse e-mail confirmée.");
    }

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("profiles")
      .update({ phone: parsed.data.phone })
      .eq("id", user.id)
      .select("id")
      .maybeSingle();

    if (error) {
      await logError("profile_phone_update_failed", error);
      return failure("Le numéro n’a pas pu être enregistré. Réessaie.");
    }

    if (!data) {
      return failure("Le profil est introuvable. Réessaie plus tard.");
    }

    return {
      success: true,
      message: "Numéro enregistré.",
      phone: parsed.data.phone,
    };
  } catch (error) {
    await logError("profile_phone_update_failed", error);
    return failure("Le numéro n’a pas pu être enregistré. Réessaie.");
  }
}

export async function updateProfile(
  _previousState: ProfileActionResult | null,
  formData: FormData,
): Promise<ProfileActionResult> {
  const parsed = profileSchema.safeParse({
    fullName: formData.get("fullName"),
    phone: formData.get("phone"),
  });

  if (!parsed.success) {
    return failure(parsed.error.issues[0]?.message ?? "Vérifie les champs.");
  }

  const avatarValue = formData.get("avatar");

  if (avatarValue !== null && !(avatarValue instanceof File)) {
    return failure("Le fichier avatar est invalide.");
  }

  const avatarFile =
    avatarValue instanceof File && avatarValue.size > 0 ? avatarValue : null;
  const clearAvatar = formData.get("clearAvatar") === "true";

  if (avatarFile && avatarFile.size > MAX_AVATAR_SIZE) {
    return failure("L’image doit peser 2 Mo maximum.");
  }

  if (avatarFile && !getAvatarExtension(avatarFile.type)) {
    return failure("Choisis une image JPG, PNG ou WebP.");
  }

  try {
    const user = await getUser();

    if (!user?.email_confirmed_at) {
      return failure("Connecte-toi avec une adresse e-mail confirmée.");
    }

    const supabase = await createClient();
    const { data: currentProfile, error: profileReadError } = await supabase
      .from("profiles")
      .select("avatar_url")
      .eq("id", user.id)
      .maybeSingle();

    if (profileReadError || !currentProfile) {
      await logError(
        "profile_read_before_update_failed",
        profileReadError ?? new Error("Profil introuvable."),
      );
      return failure("Le profil n’a pas pu être chargé. Réessaie.");
    }

    let uploadedPath: string | null = null;
    let avatarUrl = currentProfile.avatar_url;

    if (avatarFile) {
      const extension = getAvatarExtension(avatarFile.type);

      if (!extension) {
        return failure("Choisis une image JPG, PNG ou WebP.");
      }

      uploadedPath = `${user.id}/${crypto.randomUUID()}.${extension}`;
      const { error: uploadError } = await supabase.storage
        .from(AVATAR_BUCKET)
        .upload(uploadedPath, avatarFile, {
          cacheControl: "3600",
          contentType: avatarFile.type,
          upsert: false,
        });

      if (uploadError) {
        await logError("profile_avatar_upload_failed", uploadError);
        return failure("L’image n’a pas pu être envoyée. Réessaie.");
      }

      avatarUrl = supabase.storage
        .from(AVATAR_BUCKET)
        .getPublicUrl(uploadedPath).data.publicUrl;
    } else if (clearAvatar) {
      avatarUrl = null;
    }

    const { data: updatedProfile, error: updateError } = await supabase
      .from("profiles")
      .update({
        full_name: parsed.data.fullName,
        phone: parsed.data.phone,
        avatar_url: avatarUrl,
      })
      .eq("id", user.id)
      .select("id")
      .maybeSingle();

    if (updateError || !updatedProfile) {
      if (uploadedPath) {
        const { error: cleanupError } = await supabase.storage
          .from(AVATAR_BUCKET)
          .remove([uploadedPath]);

        if (cleanupError) {
          await logError("profile_avatar_cleanup_failed", cleanupError);
        }
      }

      if (updateError) {
        await logError("profile_update_failed", updateError);
      }
      return failure("Le profil n’a pas pu être enregistré. Réessaie.");
    }

    let message = "Profil enregistré.";
    const previousAvatarPath = getOwnAvatarPath(
      currentProfile.avatar_url,
      user.id,
    );
    const avatarChanged = avatarUrl !== currentProfile.avatar_url;

    if (avatarChanged && previousAvatarPath) {
      const { error: removeError } = await supabase.storage
        .from(AVATAR_BUCKET)
        .remove([previousAvatarPath]);

      if (removeError) {
        await logError("profile_old_avatar_remove_failed", removeError);
        message =
          "Profil enregistré, mais l’ancien avatar n’a pas été supprimé.";
      }
    }

    return { success: true, message };
  } catch (error) {
    await logError("profile_update_failed", error);
    return failure("Le profil n’a pas pu être enregistré. Réessaie.");
  }
}

export async function requestAccountDeletion(): Promise<ProfileActionResult> {
  try {
    const user = await getUser();

    if (!user?.email_confirmed_at) {
      return failure("Connecte-toi avec une adresse e-mail confirmée.");
    }

    if (!(await hasRecentReauthentication(user.id))) {
      return failure(
        "Confirme à nouveau ton identité avant de demander la suppression.",
      );
    }

    const supabase = await createClient();
    const { error } = await supabase
      .from("account_deletion_requests")
      .insert({ user_id: user.id });

    if (error?.code === "23505") {
      return failure("Une demande de suppression est déjà enregistrée.");
    }

    if (error) {
      await logError("account_deletion_request_failed", error);
      return failure("La demande n’a pas pu être enregistrée. Réessaie.");
    }

    await clearReauthProof();

    return {
      success: true,
      message:
        "Ta demande est enregistrée. Elle sera traitée par l’équipe de la plateforme.",
    };
  } catch (error) {
    await logError("account_deletion_request_failed", error);
    return failure("La demande n’a pas pu être enregistrée. Réessaie.");
  }
}

function getAvatarExtension(mimeType: string) {
  switch (mimeType) {
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    default:
      return undefined;
  }
}

function getOwnAvatarPath(avatarUrl: string | null, userId: string) {
  if (!avatarUrl) {
    return null;
  }

  try {
    const avatar = new URL(avatarUrl);
    const bucketPath = `/storage/v1/object/public/${AVATAR_BUCKET}/`;

    if (!avatar.pathname.startsWith(bucketPath)) {
      return null;
    }

    const path = decodeURIComponent(avatar.pathname.slice(bucketPath.length));
    return path.startsWith(`${userId}/`) ? path : null;
  } catch {
    return null;
  }
}
