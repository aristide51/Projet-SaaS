"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { logError } from "@/lib/monitoring/sentry";
import { createClient, getUser } from "@/lib/supabase/server";
import { teamPermissionsSchema } from "./permissions";

type TeamActionResult =
  | { success: true; message: string; shopId?: string }
  | { success: false; message: string };

const inviteSchema = z.object({
  shopId: z.uuid(),
  email: z.email().trim().toLowerCase(),
  permissions: teamPermissionsSchema,
});

const shopAndIdSchema = z.object({
  shopId: z.uuid(),
  id: z.uuid(),
});

function failure(message: string): TeamActionResult {
  return { success: false, message };
}

function createInvitationToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}

async function hashInvitationToken(token: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(token),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

async function verifyTeamOwner() {
  const user = await getUser();
  if (!user?.email_confirmed_at) return { error: "Compte confirmé requis." };
  return { user };
}

async function sendInvitationEmail(
  supabase: Awaited<ReturnType<typeof createClient>>,
  invitationId: string,
  shopId: string,
  token: string,
) {
  const { error } = await supabase.functions.invoke("send-shop-invitation", {
    body: { invitationId, shopId, token },
  });
  return error;
}

async function revokeUnsentInvitation(
  supabase: Awaited<ReturnType<typeof createClient>>,
  shopId: string,
  invitationId: string,
) {
  const { error } = await supabase.rpc("revoke_shop_invitation", {
    p_shop: shopId,
    p_invitation: invitationId,
  });
  if (error) await logError("team_invitation_cleanup_failed", error);
}

export async function createShopInvitation(
  input: unknown,
): Promise<TeamActionResult> {
  const parsed = inviteSchema.safeParse(input);
  if (!parsed.success) {
    return failure("Vérifie l’adresse e-mail et les permissions.");
  }

  try {
    const owner = await verifyTeamOwner();
    if ("error" in owner) return failure(owner.error);

    const supabase = await createClient();
    const token = createInvitationToken();
    const tokenHash = await hashInvitationToken(token);
    const { data: invitationId, error: createError } = await supabase.rpc(
      "create_shop_invitation",
      {
        p_shop: parsed.data.shopId,
        p_email: parsed.data.email,
        p_token_hash: tokenHash,
        p_permissions: parsed.data.permissions,
      },
    );

    if (createError || !invitationId) {
      if (createError)
        await logError("team_invitation_create_failed", createError);
      return failure(
        createError?.message.includes("plan_limit_staff")
          ? "La limite d’employés de ton plan est atteinte."
          : createError?.message.includes("invitation_already_pending")
            ? "Une invitation est déjà en attente pour cette adresse."
            : createError?.message.includes("already_shop_member")
              ? "Cette personne est déjà membre de la boutique."
              : "L’invitation n’a pas pu être créée.",
      );
    }

    const sendError = await sendInvitationEmail(
      supabase,
      invitationId,
      parsed.data.shopId,
      token,
    );
    if (sendError) {
      await logError("team_invitation_email_failed", sendError);
      await revokeUnsentInvitation(supabase, parsed.data.shopId, invitationId);
      return failure(
        "L’e-mail n’a pas pu être envoyé. L’invitation a été annulée.",
      );
    }

    revalidatePath("/dashboard/team");
    return { success: true, message: "Invitation envoyée." };
  } catch (error) {
    await logError("team_invitation_create_failed", error);
    return failure("L’invitation n’a pas pu être créée. Réessaie.");
  }
}

export async function resendShopInvitation(
  input: unknown,
): Promise<TeamActionResult> {
  const parsed = shopAndIdSchema.safeParse(input);
  if (!parsed.success) return failure("Invitation invalide.");

  try {
    const owner = await verifyTeamOwner();
    if ("error" in owner) return failure(owner.error);

    const supabase = await createClient();
    const token = createInvitationToken();
    const tokenHash = await hashInvitationToken(token);
    const { error: rotateError } = await supabase.rpc(
      "rotate_shop_invitation_token",
      {
        p_shop: parsed.data.shopId,
        p_invitation: parsed.data.id,
        p_token_hash: tokenHash,
      },
    );
    if (rotateError) {
      await logError("team_invitation_resend_failed", rotateError);
      return failure("Cette invitation ne peut plus être renvoyée.");
    }

    const sendError = await sendInvitationEmail(
      supabase,
      parsed.data.id,
      parsed.data.shopId,
      token,
    );
    if (sendError) {
      await logError("team_invitation_email_failed", sendError);
      return failure("L’e-mail n’a pas pu être envoyé. Réessaie.");
    }

    revalidatePath("/dashboard/team");
    return { success: true, message: "Invitation renvoyée." };
  } catch (error) {
    await logError("team_invitation_resend_failed", error);
    return failure("L’invitation n’a pas pu être renvoyée. Réessaie.");
  }
}

export async function revokeShopInvitation(
  input: unknown,
): Promise<TeamActionResult> {
  const parsed = shopAndIdSchema.safeParse(input);
  if (!parsed.success) return failure("Invitation invalide.");

  try {
    const owner = await verifyTeamOwner();
    if ("error" in owner) return failure(owner.error);
    const supabase = await createClient();
    const { error } = await supabase.rpc("revoke_shop_invitation", {
      p_shop: parsed.data.shopId,
      p_invitation: parsed.data.id,
    });
    if (error) {
      await logError("team_invitation_revoke_failed", error);
      return failure("L’invitation n’a pas pu être annulée.");
    }
    revalidatePath("/dashboard/team");
    return { success: true, message: "Invitation annulée." };
  } catch (error) {
    await logError("team_invitation_revoke_failed", error);
    return failure("L’invitation n’a pas pu être annulée.");
  }
}

export async function updateStaffPermissions(
  shopId: string,
  userId: string,
  input: unknown,
): Promise<TeamActionResult> {
  const parsed = z
    .object({
      shopId: z.uuid(),
      userId: z.uuid(),
      permissions: teamPermissionsSchema,
    })
    .safeParse({ shopId, userId, permissions: input });
  if (!parsed.success) return failure("Vérifie les permissions sélectionnées.");

  try {
    const owner = await verifyTeamOwner();
    if ("error" in owner) return failure(owner.error);
    const supabase = await createClient();
    const { error } = await supabase.rpc("update_shop_member_permissions", {
      p_shop: parsed.data.shopId,
      p_user: parsed.data.userId,
      p_permissions: parsed.data.permissions,
    });
    if (error) {
      await logError("team_permissions_update_failed", error);
      return failure("Les permissions n’ont pas pu être mises à jour.");
    }
    revalidatePath("/dashboard/team");
    return { success: true, message: "Permissions mises à jour." };
  } catch (error) {
    await logError("team_permissions_update_failed", error);
    return failure("Les permissions n’ont pas pu être mises à jour.");
  }
}

export async function removeShopStaff(
  input: unknown,
): Promise<TeamActionResult> {
  const parsed = shopAndIdSchema.safeParse(input);
  if (!parsed.success) return failure("Membre invalide.");

  try {
    const owner = await verifyTeamOwner();
    if ("error" in owner) return failure(owner.error);
    const supabase = await createClient();
    const { error } = await supabase.rpc("remove_shop_staff", {
      p_shop: parsed.data.shopId,
      p_user: parsed.data.id,
    });
    if (error) {
      await logError("team_staff_remove_failed", error);
      return failure("Ce membre n’a pas pu être retiré.");
    }
    revalidatePath("/dashboard/team");
    return { success: true, message: "Employé retiré de la boutique." };
  } catch (error) {
    await logError("team_staff_remove_failed", error);
    return failure("Ce membre n’a pas pu être retiré.");
  }
}

export async function acceptShopInvitation(
  token: unknown,
): Promise<TeamActionResult> {
  const parsed = z
    .string()
    .regex(/^[A-Za-z0-9_-]{43}$/)
    .safeParse(token);
  if (!parsed.success) return failure("Ce lien d’invitation est invalide.");

  try {
    const user = await getUser();
    if (!user?.email_confirmed_at) {
      return failure("Connecte-toi avec une adresse e-mail confirmée.");
    }
    const supabase = await createClient();
    const tokenHash = await hashInvitationToken(parsed.data);
    const { data: shopId, error } = await supabase.rpc(
      "accept_shop_invitation",
      { p_token_hash: tokenHash },
    );
    if (error || !shopId) {
      if (error) await logError("team_invitation_accept_failed", error);
      return failure(
        error?.message.includes("email_mismatch")
          ? "Connecte-toi avec l’adresse e-mail qui a reçu l’invitation."
          : error?.message.includes("expired")
            ? "Cette invitation a expiré. Demande un nouveau lien au propriétaire."
            : error?.message.includes("plan_limit_staff")
              ? "La limite d’employés de la boutique est atteinte."
              : "Cette invitation est invalide ou a déjà été utilisée.",
      );
    }
    revalidatePath("/dashboard/team");
    return {
      success: true,
      message: "Tu as rejoint l’équipe.",
      shopId,
    };
  } catch (error) {
    await logError("team_invitation_accept_failed", error);
    return failure("L’invitation n’a pas pu être acceptée. Réessaie.");
  }
}
