import type { MetadataRoute } from "next";
import { absoluteSiteUrl } from "@/lib/site-url";

export const dynamic = "force-dynamic";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/admin/",
        "/dashboard/",
        "/account/",
        "/auth/",
        "/api/",
        "/booking-cancel/",
        "/*/bookings/",
        "/*/checkout/",
        "/*/payment/",
      ],
    },
    sitemap: absoluteSiteUrl("/sitemap.xml"),
  };
}
