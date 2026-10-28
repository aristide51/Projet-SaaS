const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHORT_CODE_PATTERN = /^[A-Za-z0-9_-]{22}$/;

export function encodeShortProductId(productId: string): string | null {
  if (!UUID_PATTERN.test(productId)) return null;

  const hex = productId.replaceAll("-", "");
  const bytes = hex.match(/.{2}/g);
  if (!bytes) return null;

  const binary = bytes
    .map((byte) => String.fromCharCode(Number.parseInt(byte, 16)))
    .join("");
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}

export function decodeShortProductId(code: string): string | null {
  if (!SHORT_CODE_PATTERN.test(code)) return null;

  try {
    const binary = atob(code.replaceAll("-", "+").replaceAll("_", "/") + "==");
    if (binary.length !== 16) return null;

    const hex = Array.from(binary, (character) =>
      character.charCodeAt(0).toString(16).padStart(2, "0"),
    ).join("");
    const productId = [
      hex.slice(0, 8),
      hex.slice(8, 12),
      hex.slice(12, 16),
      hex.slice(16, 20),
      hex.slice(20),
    ].join("-");
    return UUID_PATTERN.test(productId) ? productId : null;
  } catch {
    return null;
  }
}
