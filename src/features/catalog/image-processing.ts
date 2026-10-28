const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_IMAGE_SIDE = 1800;

export async function convertImageToWebp(
  file: File,
  maxBytes = MAX_IMAGE_BYTES,
): Promise<File> {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    throw new Error("Choisis une image JPG, PNG ou WebP.");
  }

  const sourceUrl = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = sourceUrl;
    await image.decode();

    let width = Math.min(image.naturalWidth, MAX_IMAGE_SIDE);
    let height = Math.min(image.naturalHeight, MAX_IMAGE_SIDE);
    const scale = Math.min(
      width / image.naturalWidth,
      height / image.naturalHeight,
      1,
    );
    width = Math.max(1, Math.round(image.naturalWidth * scale));
    height = Math.max(1, Math.round(image.naturalHeight * scale));

    for (let attempt = 0; attempt < 6; attempt += 1) {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("La compression d’image est indisponible.");

      context.drawImage(image, 0, 0, width, height);
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/webp", 0.84 - attempt * 0.08),
      );
      if (blob && blob.size <= maxBytes) {
        const name = file.name.replace(/\.[^/.]+$/, "") || "image";
        return new File([blob], `${name}.webp`, { type: "image/webp" });
      }
      width = Math.max(1, Math.round(width * 0.8));
      height = Math.max(1, Math.round(height * 0.8));
    }
  } finally {
    URL.revokeObjectURL(sourceUrl);
  }

  throw new Error(
    `Cette image reste supérieure à ${Math.round(maxBytes / (1024 * 1024))} Mo après compression.`,
  );
}
