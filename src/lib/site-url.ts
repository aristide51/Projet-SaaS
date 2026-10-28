const DEVELOPMENT_SITE_URL = "http://localhost:3000";

export function getSiteUrl() {
  const configuredUrl = process.env.NEXT_PUBLIC_SITE_URL;

  if (!configuredUrl) {
    return new URL(DEVELOPMENT_SITE_URL);
  }

  try {
    return new URL(configuredUrl);
  } catch (error) {
    throw new Error("NEXT_PUBLIC_SITE_URL doit être une URL valide.", {
      cause: error,
    });
  }
}

export function absoluteSiteUrl(path: string) {
  if (
    !process.env.NEXT_PUBLIC_SITE_URL &&
    process.env.NODE_ENV === "production"
  ) {
    throw new Error("NEXT_PUBLIC_SITE_URL doit être configurée en production.");
  }
  return new URL(path, getSiteUrl()).toString();
}
