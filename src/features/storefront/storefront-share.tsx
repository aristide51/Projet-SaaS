import { QRCodeSVG } from "qrcode.react";
import { StorefrontShareActions } from "./storefront-share-actions";

type StorefrontShareProps = {
  shopName: string;
  shopSlug: string;
  shareUrl: string;
  product?: {
    id: string;
    name: string;
    price: number;
  };
};

export function StorefrontShare({
  shopName,
  shopSlug,
  shareUrl,
  product,
}: StorefrontShareProps) {
  const price = product
    ? `${new Intl.NumberFormat("fr-FR").format(product.price)} FCFA`
    : "";
  const shareMessage = product
    ? `Découvre ${product.name} à ${price} chez ${shopName} : ${shareUrl}`
    : `Découvre la boutique ${shopName} : ${shareUrl}`;

  return (
    <section
      aria-label={product ? "Partager ce produit" : "Partager cette boutique"}
      className="storefront-share"
    >
      <StorefrontShareActions
        qrCode={
          !product ? (
            <QRCodeSVG
              bgColor="#ffffff"
              fgColor="#111827"
              includeMargin
              level="M"
              size={176}
              title={`QR code de ${shopName}`}
              value={shareUrl}
            />
          ) : undefined
        }
        qrDownloadName={`${shopSlug}-qr.svg`}
        shareMessage={shareMessage}
        shareUrl={shareUrl}
      />
    </section>
  );
}
