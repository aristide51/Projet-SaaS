import { ImageResponse } from "next/og";
import { notFound } from "next/navigation";
import { getPublicShop } from "@/features/storefront/data";

export const alt = "Vitrine d’une boutique locale au Burkina Faso";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpenGraphImage({
  params,
}: {
  params: Promise<{ shop: string }>;
}) {
  const { shop: slug } = await params;
  const shop = await getPublicShop(slug);
  if (!shop) notFound();

  return new ImageResponse(
    <div
      style={{
        alignItems: "center",
        background: "#f8fafc",
        color: "#0f172a",
        display: "flex",
        height: "100%",
        padding: 72,
        width: "100%",
      }}
    >
      <div
        style={{
          background: "#1d4ed8",
          borderRadius: 28,
          height: 16,
          marginRight: 48,
          width: 16,
        }}
      />
      <div style={{ display: "flex", flexDirection: "column" }}>
        <div
          style={{
            color: "#1d4ed8",
            fontSize: 28,
            fontWeight: 700,
            marginBottom: 20,
          }}
        >
          BOUTIQUE LOCALE
        </div>
        <div
          style={{
            fontSize: 64,
            fontWeight: 700,
            lineHeight: 1.1,
            maxWidth: 950,
          }}
        >
          {shop.name}
        </div>
        <div
          style={{
            color: "#475569",
            fontSize: 32,
            marginTop: 24,
          }}
        >
          {[shop.district, shop.city].filter(Boolean).join(" · ")}
        </div>
      </div>
    </div>,
    { ...size },
  );
}
