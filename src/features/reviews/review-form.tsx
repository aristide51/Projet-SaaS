"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { convertImageToWebp } from "@/features/catalog/image-processing";
import { submitReview } from "./actions";

type Props = {
  shopId: string;
  orderId?: string;
  bookingId?: string;
};

export function ReviewForm({ shopId, orderId, bookingId }: Props) {
  const router = useRouter();
  const [photos, setPhotos] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  async function selectPhotos(files: FileList | null) {
    setNotice(null);
    if (!files?.length) {
      setPhotos([]);
      return;
    }
    if (files.length > 3) {
      setNotice({ success: false, message: "Trois photos au maximum." });
      setPhotos([]);
      return;
    }
    setBusy(true);
    try {
      const converted = await Promise.all(
        Array.from(files, (file) => convertImageToWebp(file, 3 * 1024 * 1024)),
      );
      setPhotos(converted);
    } catch (error) {
      setPhotos([]);
      setNotice({
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "Les photos n’ont pas pu être préparées.",
      });
    } finally {
      setBusy(false);
    }
  }

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setNotice(null);
    const formData = new FormData(event.currentTarget);
    formData.set("shopId", shopId);
    if (orderId) formData.set("orderId", orderId);
    if (bookingId) formData.set("bookingId", bookingId);
    for (const photo of photos) formData.append("photos", photo, photo.name);
    const result = await submitReview(formData);
    setBusy(false);
    setNotice({ success: result.success, message: result.message });
    if (result.success) router.refresh();
  }

  return (
    <form className="review-form" onSubmit={send}>
      <label>
        Ta note
        <select defaultValue="5" name="rating" required>
          <option value="5">5 — Excellent</option>
          <option value="4">4 — Très bien</option>
          <option value="3">3 — Bien</option>
          <option value="2">2 — Moyen</option>
          <option value="1">1 — Décevant</option>
        </select>
      </label>
      <label>
        Ton commentaire (facultatif)
        <textarea maxLength={2000} name="comment" rows={3} />
      </label>
      <label>
        Photos (3 maximum)
        <input
          accept="image/jpeg,image/png,image/webp"
          disabled={busy}
          multiple
          onChange={(event) => void selectPhotos(event.currentTarget.files)}
          type="file"
        />
      </label>
      {photos.length ? (
        <p>{photos.length} photo(s) prête(s) au format WebP.</p>
      ) : null}
      {notice ? (
        <p
          className={`ui-message ui-message--${notice.success ? "success" : "error"}`}
          role={notice.success ? "status" : "alert"}
        >
          {notice.message}
        </p>
      ) : null}
      <button className="ui-button ui-button--secondary" disabled={busy}>
        {busy ? "Publication…" : "Publier mon avis"}
      </button>
    </form>
  );
}
