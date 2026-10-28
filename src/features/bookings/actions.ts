"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { logError } from "@/lib/monitoring/sentry";
import { revalidatePublicShop } from "@/features/storefront/cache";
import { createClient, getUser } from "@/lib/supabase/server";
import {
  availabilityRulesSchema,
  resourceSchema,
  serviceSchema,
  shopSettingsSchema,
  timeOffSchema,
  type AvailabilityRuleInput,
  type ResourceInput,
  type ServiceInput,
  type ShopSettingsInput,
  type TimeOffInput,
} from "./schemas";

type Supabase = Awaited<ReturnType<typeof createClient>>;
type BookingAccess = { supabase: Supabase } | { error: string };
type ActionResult = { success: true } | { success: false; message: string };
type SaveResult =
  { success: true; id: string } | { success: false; message: string };

const uuidSchema = z.string().uuid();

function failure(message: string): { success: false; message: string } {
  return { success: false, message };
}

async function getShopAndAccess(shopId: string): Promise<BookingAccess> {
  if (!uuidSchema.safeParse(shopId).success) {
    return { error: "Cette boutique est invalide." };
  }

  const user = await getUser();
  if (!user.email_confirmed_at) {
    return { error: "Connecte-toi avec une adresse e-mail confirmée." };
  }

  const supabase = await createClient();
  const { data: member, error: memberError } = await supabase
    .from("shop_members")
    .select("role, permissions")
    .eq("shop_id", shopId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (memberError) {
    await logError("bookings_access_check_failed", memberError);
    return { error: "Impossible de vérifier tes droits sur cette boutique." };
  }

  const permissions =
    typeof member?.permissions === "object" &&
    member.permissions !== null &&
    !Array.isArray(member.permissions)
      ? member.permissions
      : {};
  if (!member || (member.role !== "owner" && permissions.bookings !== true)) {
    return {
      error: "Tu n’as pas le droit de gérer les rendez-vous de cette boutique.",
    };
  }

  const { data: subscription, error: subscriptionError } = await supabase
    .from("subscriptions")
    .select("plan_id, status")
    .eq("shop_id", shopId)
    .maybeSingle();
  if (subscriptionError) {
    await logError("bookings_access_check_failed", subscriptionError);
    return { error: "Impossible de vérifier le plan de cette boutique." };
  }

  const planQuery =
    subscription?.status !== "expired" && subscription?.plan_id
      ? supabase
          .from("plans")
          .select("features")
          .eq("id", subscription.plan_id)
          .maybeSingle()
      : supabase
          .from("plans")
          .select("features")
          .eq("code", "free")
          .maybeSingle();
  const { data: plan, error: planError } = await planQuery;
  if (planError || !plan) {
    if (planError) await logError("bookings_access_check_failed", planError);
    return { error: "Impossible de vérifier les options du plan." };
  }

  const features =
    typeof plan.features === "object" &&
    plan.features !== null &&
    !Array.isArray(plan.features)
      ? plan.features
      : {};
  if (features.bookings !== true) {
    return {
      error:
        "Les rendez-vous ne sont pas inclus dans ton abonnement. Passe au plan Pro pour configurer ton agenda.",
    };
  }

  return { supabase };
}

function revalidateBookings() {
  revalidatePath("/dashboard/bookings");
  revalidatePath("/dashboard");
}

function bookingActionMessage(errorMessage: string, fallback: string) {
  if (errorMessage.includes("plan_feature_bookings")) {
    return "Les rendez-vous nécessitent le plan Pro. Passe au plan Pro pour continuer.";
  }
  if (errorMessage.includes("availability_rules_overlap")) {
    return "Deux plages horaires de la même ressource se chevauchent.";
  }
  if (errorMessage.includes("resource_not_found")) {
    return "Choisis une ressource active de cette boutique.";
  }
  if (errorMessage.includes("service_not_found")) {
    return "Ce service n’existe plus. Recharge la page puis réessaie.";
  }
  return fallback;
}

export async function saveAvailabilityRules(
  shopId: string,
  rules: AvailabilityRuleInput[],
): Promise<ActionResult> {
  const access = await getShopAndAccess(shopId);
  if ("error" in access) return failure(access.error);

  const parsed = availabilityRulesSchema.safeParse(
    rules.map((rule) => ({ ...rule, shop_id: shopId })),
  );
  if (!parsed.success) {
    return failure(
      parsed.error.issues[0]?.message ??
        "Vérifie les horaires et les ressources choisies.",
    );
  }

  const { error } = await access.supabase.rpc("save_availability_rules", {
    p_shop: shopId,
    p_rules: parsed.data.map(
      ({ resource_id, weekday, start_time, end_time }) => ({
        resource_id,
        weekday,
        start_time,
        end_time,
      }),
    ),
  });
  if (error) {
    await logError("booking_availability_save_failed", error);
    return failure(
      bookingActionMessage(
        error.message,
        "Impossible d’enregistrer les horaires.",
      ),
    );
  }

  revalidateBookings();
  return { success: true };
}

export async function saveTimeOff(
  shopId: string,
  input: TimeOffInput,
): Promise<SaveResult> {
  const access = await getShopAndAccess(shopId);
  if ("error" in access) return failure(access.error);

  const parsed = timeOffSchema.safeParse({ ...input, shop_id: shopId });
  if (!parsed.success) {
    return failure(
      parsed.error.issues[0]?.message ?? "Vérifie les dates de fermeture.",
    );
  }

  const values = {
    resource_id: parsed.data.resource_id ?? null,
    starts_at: parsed.data.starts_at,
    ends_at: parsed.data.ends_at,
    reason: parsed.data.reason?.trim() || null,
  };
  const { data, error } = parsed.data.id
    ? await access.supabase
        .from("time_off")
        .update(values)
        .eq("id", parsed.data.id)
        .eq("shop_id", shopId)
        .select("id")
        .maybeSingle()
    : await access.supabase
        .from("time_off")
        .insert({ ...values, shop_id: shopId })
        .select("id")
        .maybeSingle();

  if (error || !data) {
    if (error) await logError("booking_time_off_save_failed", error);
    return failure(
      bookingActionMessage(
        error?.message ?? "",
        "Impossible d’enregistrer cette fermeture.",
      ),
    );
  }

  revalidateBookings();
  return { success: true, id: data.id };
}

export async function deleteTimeOff(
  shopId: string,
  timeOffId: string,
): Promise<ActionResult> {
  const access = await getShopAndAccess(shopId);
  if ("error" in access) return failure(access.error);
  if (!uuidSchema.safeParse(timeOffId).success) {
    return failure("Cette fermeture est invalide.");
  }

  const { data, error } = await access.supabase
    .from("time_off")
    .delete()
    .eq("id", timeOffId)
    .eq("shop_id", shopId)
    .select("id")
    .maybeSingle();
  if (error || !data) {
    if (error) await logError("booking_time_off_delete_failed", error);
    return failure(
      bookingActionMessage(
        error?.message ?? "",
        "Impossible de supprimer cette fermeture.",
      ),
    );
  }

  revalidateBookings();
  return { success: true };
}

export async function saveResource(
  shopId: string,
  input: ResourceInput,
): Promise<SaveResult> {
  const access = await getShopAndAccess(shopId);
  if ("error" in access) return failure(access.error);

  const parsed = resourceSchema.safeParse({ ...input, shop_id: shopId });
  if (!parsed.success) {
    return failure(
      parsed.error.issues[0]?.message ?? "Vérifie le nom de la ressource.",
    );
  }

  const { data, error } = parsed.data.id
    ? await access.supabase
        .from("resources")
        .update({ name: parsed.data.name, active: parsed.data.active })
        .eq("id", parsed.data.id)
        .eq("shop_id", shopId)
        .select("id")
        .maybeSingle()
    : await access.supabase
        .from("resources")
        .insert({
          shop_id: shopId,
          name: parsed.data.name,
          active: parsed.data.active,
        })
        .select("id")
        .maybeSingle();

  if (error || !data) {
    if (error) await logError("booking_resource_save_failed", error);
    return failure(
      bookingActionMessage(
        error?.message ?? "",
        "Impossible d’enregistrer cette ressource.",
      ),
    );
  }

  revalidateBookings();
  return { success: true, id: data.id };
}

export async function deleteResource(
  shopId: string,
  resourceId: string,
): Promise<ActionResult> {
  const access = await getShopAndAccess(shopId);
  if ("error" in access) return failure(access.error);
  if (!uuidSchema.safeParse(resourceId).success) {
    return failure("Cette ressource est invalide.");
  }

  const { data, error } = await access.supabase
    .from("resources")
    .update({ active: false })
    .eq("id", resourceId)
    .eq("shop_id", shopId)
    .select("id")
    .maybeSingle();
  if (error || !data) {
    if (error) await logError("booking_resource_delete_failed", error);
    return failure(
      bookingActionMessage(
        error?.message ?? "",
        "Impossible de désactiver cette ressource.",
      ),
    );
  }

  revalidateBookings();
  return { success: true };
}

export async function saveService(
  shopId: string,
  input: ServiceInput,
): Promise<SaveResult> {
  const access = await getShopAndAccess(shopId);
  if ("error" in access) return failure(access.error);

  const parsed = serviceSchema.safeParse({ ...input, shop_id: shopId });
  if (!parsed.success) {
    return failure(
      parsed.error.issues[0]?.message ?? "Vérifie les informations du service.",
    );
  }

  const { data, error } = await access.supabase.rpc("save_catalog_service", {
    p_shop: shopId,
    p_service: {
      id: parsed.data.id ?? null,
      name: parsed.data.name,
      description: parsed.data.description?.trim() || null,
      duration_min: parsed.data.duration_min,
      price: parsed.data.price,
      deposit_amount: parsed.data.deposit_amount,
      active: parsed.data.active,
    },
  });

  if (error || !data) {
    if (error) await logError("booking_service_save_failed", error);
    return failure(
      bookingActionMessage(
        error?.message ?? "",
        "Impossible d’enregistrer ce service.",
      ),
    );
  }

  revalidatePublicShop(shopId);
  revalidateBookings();
  return { success: true, id: data };
}

export async function deleteService(
  shopId: string,
  serviceId: string,
): Promise<ActionResult> {
  const access = await getShopAndAccess(shopId);
  if ("error" in access) return failure(access.error);
  if (!uuidSchema.safeParse(serviceId).success) {
    return failure("Ce service est invalide.");
  }

  const { data, error } = await access.supabase
    .from("services")
    .update({ active: false, deleted_at: new Date().toISOString() })
    .eq("id", serviceId)
    .eq("shop_id", shopId)
    .select("id")
    .maybeSingle();
  if (error || !data) {
    if (error) await logError("booking_service_delete_failed", error);
    return failure(
      bookingActionMessage(
        error?.message ?? "",
        "Impossible de désactiver ce service.",
      ),
    );
  }

  revalidateBookings();
  return { success: true };
}

export async function saveShopSettings(
  shopId: string,
  input: ShopSettingsInput,
): Promise<ActionResult> {
  const access = await getShopAndAccess(shopId);
  if ("error" in access) return failure(access.error);

  const parsed = shopSettingsSchema.safeParse({ ...input, shop_id: shopId });
  if (!parsed.success) {
    return failure(
      parsed.error.issues[0]?.message ?? "Vérifie les réglages de réservation.",
    );
  }

  const { data, error } = await access.supabase
    .from("shop_settings")
    .update({
      booking_min_notice_hours: parsed.data.booking_min_notice_hours,
      booking_auto_confirm: parsed.data.booking_auto_confirm,
      booking_cancel_before_hours: parsed.data.booking_cancel_before_hours,
    })
    .eq("shop_id", shopId)
    .select("shop_id")
    .maybeSingle();
  if (error || !data) {
    if (error) await logError("booking_settings_save_failed", error);
    return failure(
      bookingActionMessage(
        error?.message ?? "",
        "Impossible d’enregistrer les réglages de réservation.",
      ),
    );
  }

  revalidateBookings();
  return { success: true };
}

export async function setMerchantBookingStatus(
  shopId: string,
  bookingId: string,
  status: string,
  reason: string,
): Promise<ActionResult> {
  const access = await getShopAndAccess(shopId);
  if ("error" in access) return failure(access.error);

  const parsedStatus = z
    .enum(["confirmed", "cancelled", "completed", "no_show"])
    .safeParse(status);
  const parsedReason = z.string().max(500).safeParse(reason);
  if (
    !uuidSchema.safeParse(bookingId).success ||
    !parsedStatus.success ||
    !parsedReason.success
  ) {
    return failure("Cette action de rendez-vous est invalide.");
  }
  if (parsedStatus.data === "cancelled" && !parsedReason.data.trim()) {
    return failure("Un motif est obligatoire pour annuler le rendez-vous.");
  }

  const { error } = await access.supabase.rpc("set_booking_status", {
    p_booking_id: bookingId,
    p_to: parsedStatus.data,
    ...(parsedReason.data.trim()
      ? { p_reason: parsedReason.data.trim() }
      : {}),
  });
  if (error) {
    await logError("booking_status_update_failed", error);
    if (error.message.includes("booking_not_started")) {
      return failure("Ce rendez-vous n’a pas encore commencé.");
    }
    if (error.message.includes("booking_not_finished")) {
      return failure("Ce rendez-vous n’est pas encore terminé.");
    }
    if (error.message.includes("transition_not_allowed")) {
      return failure("Ce changement de statut n’est plus autorisé.");
    }
    return failure("Impossible de mettre à jour le rendez-vous.");
  }

  revalidateBookings();
  return { success: true };
}
