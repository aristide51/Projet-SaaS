import { ImageResponse } from "next/og";
import { notFound } from "next/navigation";
import { getPublicProduct, getPublicShop } from "@/features/storefront/data";

export const alt = "Produit proposé par une boutique locale";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default async function OpenGraphImage({
  params,
}: {
  params: Promise<{ shop: string; product: string }>;
}) {
  const { shop: slug, product: productId } = await params;
  if (!UUID_PATTERN.test(productId)) notFound();
  const shop = await getPublicShop(slug);
  if (!shop) notFound();
  const product = await getPublicProduct(shop.id, productId);
  if (!product) notFound();

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
          {shop.name}
        </div>
        <div
          style={{
            fontSize: 58,
            fontWeight: 700,
            lineHeight: 1.1,
            maxWidth: 950,
          }}
        >
          {product.name}
        </div>
        <div
          style={{
            color: "#475569",
            fontSize: 32,
            marginTop: 24,
          }}
        >
          {new Intl.NumberFormat("fr-FR").format(product.price)} FCFA
        </div>
      </div>
    </div>,
    { ...size },
  );
}
