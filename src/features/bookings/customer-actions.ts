"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { logError } from "@/lib/monitoring/sentry";
import { createClient, getOptionalUser } from "@/lib/supabase/server";

const uuidSchema = z.string().uuid();
const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return (
      !Number.isNaN(parsed.valueOf()) &&
      parsed.toISOString().slice(0, 10) === value
    );
  });

const slotRequestSchema = z.object({
  shopId: uuidSchema,
  serviceId: uuidSchema,
  resourceId: uuidSchema,
  date: dateSchema,
});

const bookingRequestSchema = slotRequestSchema.extend({
  shopSlug: z.string().min(1).max(120),
  startsAt: z.string().datetime({ offset: true }),
  note: z.string().trim().max(500),
});

type AvailableSlot = {
  slot_start: string;
  slot_end: string;
};

type BookingErrorCode =
  | "not_authenticated"
  | "phone_required"
  | "plan_feature_bookings"
  | "too_soon"
  | "outside_opening_hours"
  | "slot_taken"
  | "cancellation_too_late"
  | "transition_not_allowed"
  | "unavailable";

export type SlotLookupResult =
  | { success: true; slots: AvailableSlot[] }
  | { success: false; code: BookingErrorCode; message: string };

export type CreateBookingResult =
  | { success: true; bookingId: string }
  | {
      success: false;
      code: BookingErrorCode;
      message: string;
      nearbySlots?: AvailableSlot[];
    };

export type CancelBookingResult =
  { success: true } | { success: false; message: string };

function classifyBookingError(message: string): BookingErrorCode {
  const knownErrors: [string, BookingErrorCode][] = [
    ["not_authenticated", "not_authenticated"],
    ["phone_required", "phone_required"],
    ["plan_feature_bookings", "plan_feature_bookings"],
    ["too_soon", "too_soon"],
    ["outside_opening_hours", "outside_opening_hours"],
    ["slot_taken", "slot_taken"],
    ["cancellation_too_late", "cancellation_too_late"],
    ["transition_not_allowed", "transition_not_allowed"],
    ["shop_not_available", "unavailable"],
    ["service_not_found", "unavailable"],
    ["resource_not_found", "unavailable"],
    ["time_off", "unavailable"],
  ];

  return (
    knownErrors.find(([marker]) => message.includes(marker))?.[1] ??
    "unavailable"
  );
}

function bookingErrorMessage(code: BookingErrorCode) {
  switch (code) {
    case "not_authenticated":
      return "Connecte-toi avec une adresse e-mail confirmée pour réserver.";
    case "phone_required":
      return "Ajoute un numéro de téléphone à ton profil avant de réserver.";
    case "plan_feature_bookings":
      return "Les réservations en ligne ne sont pas disponibles pour cette boutique.";
    case "too_soon":
      return "Ce créneau est trop proche. Choisis une autre date.";
    case "outside_opening_hours":
      return "Ce créneau ne correspond plus aux horaires de la boutique.";
    case "slot_taken":
      return "Ce créneau vient d’être réservé. Choisis l’un des créneaux proches proposés.";
    case "cancellation_too_late":
      return "Le délai d’annulation est dépassé. Contacte directement la boutique.";
    case "transition_not_allowed":
      return "Ce rendez-vous ne peut plus être annulé depuis ton compte.";
    case "unavailable":
      return "Cette disponibilité a changé. Recharge les créneaux puis réessaie.";
  }
}

async function verifiedCustomer() {
  const user = await getOptionalUser();
  return user?.email_confirmed_at ? user : null;
}

async function loadNearbySlots(
  supabase: Awaited<ReturnType<typeof createClient>>,
  serviceId: string,
  resourceId: string,
  firstDate: string,
) {
  const start = new Date(`${firstDate}T00:00:00.000Z`);
  const dates = Array.from({ length: 8 }, (_, offset) => {
    const date = new Date(start);
    date.setUTCDate(date.getUTCDate() + offset);
    return date.toISOString().slice(0, 10);
  });
  const results = await Promise.all(
    dates.map((date) =>
      supabase.rpc("get_available_slots", {
        p_service_id: serviceId,
        p_resource_id: resourceId,
        p_date: date,
      }),
    ),
  );
  const nearby: AvailableSlot[] = [];
  for (const result of results) {
    if (result.error) {
      await logError("booking_nearby_slots_lookup_failed", result.error);
      continue;
    }
    nearby.push(...(result.data ?? []));
  }
  return nearby
    .sort(
      (left, right) =>
        Date.parse(left.slot_start) - Date.parse(right.slot_start),
    )
    .slice(0, 6);
}

export async function getAvailableBookingSlots(
  input: unknown,
): Promise<SlotLookupResult> {
  const parsed = slotRequestSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      code: "unavailable",
      message: "Vérifie le service, la ressource et la date choisis.",
    };
  }

  if (!(await verifiedCustomer())) {
    return {
      success: false,
      code: "not_authenticated",
      message: bookingErrorMessage("not_authenticated"),
    };
  }

  const supabase = await createClient();
  const { data: service, error: serviceError } = await supabase
    .from("services")
    .select("id, shop_id")
    .eq("id", parsed.data.serviceId)
    .eq("shop_id", parsed.data.shopId)
    .eq("active", true)
    .is("deleted_at", null)
    .maybeSingle();

  if (serviceError) {
    await logError("booking_service_lookup_failed", serviceError);
    return {
      success: false,
      code: "unavailable",
      message: bookingErrorMessage("unavailable"),
    };
  }

  const { data: resource, error: resourceError } = await supabase
    .from("resources")
    .select("id")
    .eq("id", parsed.data.resourceId)
    .eq("shop_id", parsed.data.shopId)
    .eq("active", true)
    .maybeSingle();

  if (resourceError) {
    await logError("booking_resource_lookup_failed", resourceError);
    return {
      success: false,
      code: "unavailable",
      message: bookingErrorMessage("unavailable"),
    };
  }

  if (!service || !resource) {
    return {
      success: false,
      code: "unavailable",
      message: bookingErrorMessage("unavailable"),
    };
  }

  const { data, error } = await supabase.rpc("get_available_slots", {
    p_service_id: service.id,
    p_resource_id: resource.id,
    p_date: parsed.data.date,
  });

  if (error) {
    const code = classifyBookingError(error.message);
    if (code === "unavailable") {
      await logError("booking_slots_lookup_failed", error);
    }
    return { success: false, code, message: bookingErrorMessage(code) };
  }

  return { success: true, slots: data ?? [] };
}

export async function createCustomerBooking(
  input: unknown,
): Promise<CreateBookingResult> {
  const parsed = bookingRequestSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      code: "unavailable",
      message: "Vérifie les informations du rendez-vous.",
    };
  }

  if (!(await verifiedCustomer())) {
    return {
      success: false,
      code: "not_authenticated",
      message: bookingErrorMessage("not_authenticated"),
    };
  }

  const supabase = await createClient();
  const { data: shop, error: shopError } = await supabase
    .from("shops")
    .select("slug")
    .eq("id", parsed.data.shopId)
    .eq("slug", parsed.data.shopSlug)
    .eq("review_status", "approved")
    .eq("is_suspended", false)
    .maybeSingle();

  if (shopError) {
    await logError("booking_shop_lookup_failed", shopError);
    return {
      success: false,
      code: "unavailable",
      message: bookingErrorMessage("unavailable"),
    };
  }

  if (!shop) {
    return {
      success: false,
      code: "unavailable",
      message: bookingErrorMessage("unavailable"),
    };
  }

  const [serviceResult, resourceResult] = await Promise.all([
    supabase
      .from("services")
      .select("id")
      .eq("id", parsed.data.serviceId)
      .eq("shop_id", parsed.data.shopId)
      .eq("active", true)
      .is("deleted_at", null)
      .maybeSingle(),
    supabase
      .from("resources")
      .select("id")
      .eq("id", parsed.data.resourceId)
      .eq("shop_id", parsed.data.shopId)
      .eq("active", true)
      .maybeSingle(),
  ]);
  const bookingEntityError = serviceResult.error ?? resourceResult.error;
  if (bookingEntityError) {
    await logError("booking_create_entity_lookup_failed", bookingEntityError);
    return {
      success: false,
      code: "unavailable",
      message: bookingErrorMessage("unavailable"),
    };
  }
  if (!serviceResult.data || !resourceResult.data) {
    return {
      success: false,
      code: "unavailable",
      message: bookingErrorMessage("unavailable"),
    };
  }

  const { data, error } = await supabase.rpc("book_slot", {
    p_service_id: parsed.data.serviceId,
    p_resource_id: parsed.data.resourceId,
    p_start: parsed.data.startsAt,
    ...(parsed.data.note ? { p_note: parsed.data.note } : {}),
  });

  if (error) {
    const code = classifyBookingError(error.message);
    if (code === "unavailable") {
      await logError("booking_create_failed", error);
    }
    const nearbySlots =
      code === "slot_taken"
        ? await loadNearbySlots(
            supabase,
            parsed.data.serviceId,
            parsed.data.resourceId,
            parsed.data.startsAt.slice(0, 10),
          )
        : undefined;
    return {
      success: false,
      code,
      message: bookingErrorMessage(code),
      ...(nearbySlots ? { nearbySlots } : {}),
    };
  }

  revalidatePath("/account/bookings");
  revalidatePath(`/${shop.slug}/bookings`);
  return { success: true, bookingId: data };
}

export async function cancelCustomerBooking(
  bookingId: string,
): Promise<CancelBookingResult> {
  if (!uuidSchema.safeParse(bookingId).success) {
    return { success: false, message: "Ce rendez-vous est invalide." };
  }

  if (!(await verifiedCustomer())) {
    return {
      success: false,
      message: bookingErrorMessage("not_authenticated"),
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_booking_status", {
    p_booking_id: bookingId,
    p_to: "cancelled",
    p_reason: "Annulé à la demande du client",
  });

  if (error) {
    const code = classifyBookingError(error.message);
    if (code === "unavailable") {
      await logError("booking_cancel_failed", error);
    }
    return { success: false, message: bookingErrorMessage(code) };
  }

  revalidatePath("/account/bookings");
  revalidatePath("/account");
  return { success: true };
}
