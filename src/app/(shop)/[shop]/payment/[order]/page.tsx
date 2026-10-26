import { notFound, redirect } from "next/navigation";
import { UssdPayment } from "@/features/orders/ussd-payment";
import { getPublicShop } from "@/features/storefront/data";
import { logError } from "@/lib/monitoring/sentry";
import { createClient, getOptionalUser } from "@/lib/supabase/server";

export default async function UssdPaymentPage({
  params,
}: {
  params: Promise<{ shop: string; order: string }>;
}) {
  const { shop: slug, order: orderId } = await params;
  const shop = await getPublicShop(slug);
  if (!shop) notFound();

  const user = await getOptionalUser();
  if (!user?.email_confirmed_at) {
    const next = `/${encodeURIComponent(slug)}/payment/${encodeURIComponent(orderId)}`;
    redirect(`/auth/login?next=${encodeURIComponent(next)}`);
  }

  const supabase = await createClient();
  const { data: order, error: orderError } = await supabase
    .from("orders")
    .select(
      "id, shop_id, code, status, payment_method, total, expires_at, reject_count",
    )
    .eq("id", orderId)
    .eq("shop_id", shop.id)
    .eq("customer_id", user.id)
    .maybeSingle();

  if (orderError) {
    await logError("payment_page_order_read_failed", orderError);
    throw new Error("Le paiement de la commande n’a pas pu être chargé.", {
      cause: orderError,
    });
  }
  if (!order || !order.payment_method.startsWith("ussd_")) notFound();

  const [methodResult, declarationResult] = await Promise.all([
    supabase
      .from("shop_payment_methods")
      .select("phone_or_code, ussd_template")
      .eq("shop_id", shop.id)
      .eq("type", order.payment_method)
      .maybeSingle(),
    supabase
      .from("payment_declarations")
      .select("payer_phone, transaction_ref, status, reject_reason, created_at")
      .eq("order_id", order.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (methodResult.error || declarationResult.error) {
    const error = methodResult.error ?? declarationResult.error;
    await logError("payment_page_details_read_failed", error);
    throw new Error(
      "Les informations de paiement n’ont pas pu être chargées.",
      {
        cause: error,
      },
    );
  }

  return (
    <main className="checkout-page">
      <UssdPayment
        key={`${order.id}:${order.status}:${order.reject_count}`}
        declaration={
          declarationResult.data
            ? {
                payerPhone: declarationResult.data.payer_phone,
                transactionReference: declarationResult.data.transaction_ref,
                status: declarationResult.data.status,
                rejectReason: declarationResult.data.reject_reason,
              }
            : null
        }
        order={{
          id: order.id,
          code: order.code,
          status: order.status,
          paymentMethod: order.payment_method,
          total: order.total,
          expiresAt: order.expires_at,
          rejectCount: order.reject_count,
        }}
        paymentMethod={
          methodResult.data
            ? {
                phoneOrCode: methodResult.data.phone_or_code,
                ussdTemplate: methodResult.data.ussd_template,
              }
            : null
        }
        shop={{ id: shop.id, name: shop.name, slug: shop.slug }}
      />
    </main>
  );
}
