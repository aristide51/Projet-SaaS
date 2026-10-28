import type { MetadataRoute } from "next";
import { getPublicSitemapEntries } from "@/features/storefront/data";
import { absoluteSiteUrl } from "@/lib/site-url";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const entries = await getPublicSitemapEntries();
  const now = new Date();

  return [
    {
      url: absoluteSiteUrl("/"),
      lastModified: now,
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: absoluteSiteUrl("/shops"),
      lastModified: now,
      changeFrequency: "daily",
      priority: 0.9,
    },
    ...entries.map((entry) => ({
      url: absoluteSiteUrl(entry.urlPath),
      lastModified: entry.lastModified,
      changeFrequency: "weekly" as const,
      priority: entry.urlPath.includes("/products/") ? 0.7 : 0.8,
    })),
  ];
}
