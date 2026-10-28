"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { revalidatePublicShop } from "@/features/storefront/cache";
import { logError } from "@/lib/monitoring/sentry";
import { createClient, getOptionalUser } from "@/lib/supabase/server";

const uuid = z.string().uuid();
const reviewInput = z.object({
  shopId: uuid,
  orderId: uuid.optional(),
  bookingId: uuid.optional(),
  rating: z.coerce.number().int().min(1).max(5),
  comment: z.string().trim().max(2000),
});

export type ReviewActionResult =
  { success: true; message: string } | { success: false; message: string };

function failure(message: string): ReviewActionResult {
  return { success: false, message };
}

function isWebp(file: File) {
  if (
    file.type !== "image/webp" ||
    file.size < 12 ||
    file.size > 3 * 1024 * 1024
  ) {
    return false;
  }
  return file
    .slice(0, 12)
    .arrayBuffer()
    .then((buffer) => {
      const bytes = new Uint8Array(buffer);
      return (
        String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
        String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
      );
    });
}

export async function submitReview(
  formData: FormData,
): Promise<ReviewActionResult> {
  const parsed = reviewInput.safeParse({
    shopId: formData.get("shopId"),
    orderId: formData.get("orderId") || undefined,
    bookingId: formData.get("bookingId") || undefined,
    rating: formData.get("rating"),
    comment: formData.get("comment") ?? "",
  });
  if (
    !parsed.success ||
    Boolean(parsed.data.orderId) === Boolean(parsed.data.bookingId)
  ) {
    return failure(
      "Vérifie ta note et le rendez-vous ou la commande concernés.",
    );
  }

  const photos = formData
    .getAll("photos")
    .filter((entry): entry is File => entry instanceof File && entry.size > 0);
  if (photos.length > 3) {
    return failure("Tu peux joindre trois photos au maximum.");
  }
  for (const photo of photos) {
    if (!(await isWebp(photo))) {
      return failure("Chaque photo doit être une image WebP de 3 Mo maximum.");
    }
  }

  const user = await getOptionalUser();
  if (!user?.email_confirmed_at) {
    return failure(
      "Connecte-toi avec une adresse e-mail confirmée pour publier un avis.",
    );
  }

  const supabase = await createClient();
  const { data: review, error: insertError } = await supabase
    .from("reviews")
    .insert({
      shop_id: parsed.data.shopId,
      customer_id: user.id,
      order_id: parsed.data.orderId ?? null,
      booking_id: parsed.data.bookingId ?? null,
      rating: parsed.data.rating,
      comment: parsed.data.comment || null,
      photo_paths: [],
    })
    .select("id")
    .single();

  if (insertError || !review) {
    if (insertError) await logError("review_create_failed", insertError);
    return failure(
      insertError?.message.includes("review_not_allowed")
        ? "Seuls les achats ou rendez-vous terminés peuvent être évalués."
        : insertError?.message.includes("review_rate_limited")
          ? "Tu as atteint la limite de trois avis par heure. Réessaie plus tard."
          : insertError?.message.includes("review_contains_link")
            ? "Les liens ne sont pas autorisés dans un avis."
            : insertError?.message.includes("review_spam_repeated")
              ? "Ce commentaire court a déjà été publié récemment."
              : insertError?.code === "23505"
                ? "Tu as déjà laissé un avis pour cette expérience."
                : "L’avis n’a pas pu être publié. Vérifie ton admissibilité puis réessaie.",
    );
  }

  const paths: string[] = [];
  for (const photo of photos) {
    const path = `${parsed.data.shopId}/${user.id}/${review.id}/${crypto.randomUUID()}.webp`;
    const { error } = await supabase.storage
      .from("review-photos")
      .upload(path, photo, { contentType: "image/webp", upsert: false });
    if (error) {
      await logError("review_photo_upload_failed", error);
      await cleanupReview(supabase, review.id, paths);
      return failure("Une photo n’a pas pu être envoyée. L’avis a été annulé.");
    }
    paths.push(path);
  }

  if (paths.length > 0) {
    const { error } = await supabase
      .from("reviews")
      .update({ photo_paths: paths })
      .eq("id", review.id);
    if (error) {
      await logError("review_photo_attach_failed", error);
      await cleanupReview(supabase, review.id, paths);
      return failure("Les photos n’ont pas pu être associées à l’avis.");
    }
  }

  revalidatePublicShop(parsed.data.shopId);
  revalidatePath("/account");
  revalidatePath("/account/bookings");
  return { success: true, message: "Merci, ton avis a été publié." };
}

async function cleanupReview(
  supabase: Awaited<ReturnType<typeof createClient>>,
  reviewId: string,
  paths: string[],
) {
  if (paths.length > 0) {
    const { error } = await supabase.storage
      .from("review-photos")
      .remove(paths);
    if (error) await logError("review_photo_cleanup_failed", error);
  }
  const { error } = await supabase.from("reviews").delete().eq("id", reviewId);
  if (error) await logError("review_cleanup_failed", error);
}

export async function reportReview(
  reviewId: string,
  reason: string,
): Promise<ReviewActionResult> {
  if (
    !uuid.safeParse(reviewId).success ||
    reason.trim().length < 5 ||
    reason.length > 500
  ) {
    return failure("Le motif doit contenir entre 5 et 500 caractères.");
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("report_review", {
    p_review_id: reviewId,
    p_reason: reason.trim(),
  });
  if (error) {
    if (error.message.includes("review_already_reported")) {
      return failure("Tu as déjà signalé cet avis.");
    }
    await logError("review_report_failed", error);
    return failure("Le signalement n’a pas pu être envoyé.");
  }
  return { success: true, message: "Signalement transmis à l’équipe." };
}

export async function replyToReview(
  reviewId: string,
  shopId: string,
  reply: string,
): Promise<ReviewActionResult> {
  if (
    !uuid.safeParse(reviewId).success ||
    !uuid.safeParse(shopId).success ||
    reply.trim().length < 1 ||
    reply.length > 1000
  ) {
    return failure("La réponse doit contenir entre 1 et 1 000 caractères.");
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("reply_to_review", {
    p_review_id: reviewId,
    p_reply: reply.trim(),
  });
  if (error) {
    await logError("review_reply_failed", error);
    return failure("La réponse n’a pas pu être enregistrée.");
  }
  revalidatePublicShop(shopId);
  revalidatePath("/dashboard/reviews");
  return { success: true, message: "Réponse publiée." };
}

export async function resolveReviewReport(
  reportId: string,
  status: "resolved" | "dismissed",
): Promise<ReviewActionResult> {
  if (!uuid.safeParse(reportId).success) {
    return failure("Ce signalement est invalide.");
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("resolve_review_report", {
    p_report_id: reportId,
    p_status: status,
  });
  if (error) {
    await logError("review_report_resolution_failed", error);
    return failure("Le signalement n’a pas pu être traité.");
  }
  revalidatePath("/admin/review-reports");
  return { success: true, message: "Signalement traité." };
}

export async function moderateReview(
  reviewId: string,
  status: "published" | "hidden" | "flagged",
  reason: string,
  reportId?: string,
): Promise<ReviewActionResult> {
  if (
    !uuid.safeParse(reviewId).success ||
    (reportId !== undefined && !uuid.safeParse(reportId).success) ||
    reason.trim().length > 500
  ) {
    return failure("Les informations de modération sont invalides.");
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("moderate_review", {
    p_review_id: reviewId,
    p_status: status,
    p_reason: reason.trim() || "Décision de modération",
  });
  if (error) {
    if (error.message.includes("review_status_unchanged")) {
      return failure("Cet avis a déjà ce statut.");
    }
    await logError("review_moderation_failed", error);
    return failure("La décision de modération n’a pas pu être enregistrée.");
  }

  if (reportId) {
    const { error: reportError } = await supabase.rpc("resolve_review_report", {
      p_report_id: reportId,
      p_status: status === "hidden" ? "resolved" : "dismissed",
    });
    if (reportError) {
      await logError("review_report_resolution_failed", reportError);
      revalidatePath("/admin/review-reports");
      return failure(
        "Le statut de l’avis a changé, mais le signalement reste à traiter.",
      );
    }
  }
  revalidatePublicShopForReview(supabase, reviewId);
  revalidatePath("/admin/review-reports");
  return { success: true, message: "Décision de modération enregistrée." };
}

async function revalidatePublicShopForReview(
  supabase: Awaited<ReturnType<typeof createClient>>,
  reviewId: string,
) {
  const { data: review, error } = await supabase
    .from("reviews")
    .select("shop_id")
    .eq("id", reviewId)
    .maybeSingle();
  if (error) {
    await logError("review_moderation_shop_lookup_failed", error);
    return;
  }
  if (review) revalidatePublicShop(review.shop_id);
}
