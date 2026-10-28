import {
  AdminWorkspace,
  type AdminShop,
  type AdminAuditEntry,
} from "@/features/admin/admin-workspace";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

type AdminProductRow = Pick<
  Database["public"]["Tables"]["products"]["Row"],
  "id" | "shop_id" | "name" | "description" | "price"
>;
type AdminServiceRow = Pick<
  Database["public"]["Tables"]["services"]["Row"],
  "id" | "shop_id" | "name" | "description" | "price"
>;
type AdminProfileRow = Pick<
  Database["public"]["Tables"]["profiles"]["Row"],
  "id" | "full_name" | "phone"
>;

export default async function AdminPage() {
  const supabase = await createClient();
  const [pendingResult, approvedResult, auditResult] = await Promise.all([
    supabase
      .from("shops")
      .select(
        "id, name, slug, category, description, logo_path, created_by, created_at, submitted_at, whatsapp, phone, city, district, address, review_status",
      )
      .eq("review_status", "submitted")
      .order("submitted_at", { ascending: true })
      .limit(1000),
    supabase
      .from("shops")
      .select("id, name, slug, is_suspended")
      .eq("review_status", "approved")
      .order("name")
      .limit(100),
    supabase
      .from("audit_log")
      .select(
        "id, actor_id, shop_id, action, entity, entity_id, metadata, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(30),
  ]);
  const queryError =
    pendingResult.error ?? approvedResult.error ?? auditResult.error;
  if (queryError) {
    throw new Error("Impossible de charger le back-office.", {
      cause: queryError,
    });
  }

  const submitted = pendingResult.data ?? [];
  const shopIds = submitted.map((shop) => shop.id);
  const ownerIds = [...new Set(submitted.map((shop) => shop.created_by))];
  let productRows: AdminProductRow[] = [];
  let serviceRows: AdminServiceRow[] = [];
  let profileRows: AdminProfileRow[] = [];
  if (shopIds.length > 0) {
    const [productsResult, servicesResult, profilesResult] = await Promise.all([
      supabase
        .from("products")
        .select("id, shop_id, name, description, price")
        .in("shop_id", shopIds)
        .eq("is_sample", false)
        .is("deleted_at", null)
        .order("created_at", { ascending: false }),
      supabase
        .from("services")
        .select("id, shop_id, name, description, price")
        .in("shop_id", shopIds)
        .eq("is_sample", false)
        .is("deleted_at", null)
        .order("created_at", { ascending: false }),
      supabase
        .from("profiles")
        .select("id, full_name, phone")
        .in("id", ownerIds),
    ]);
    const detailsError =
      productsResult.error ?? servicesResult.error ?? profilesResult.error;
    if (detailsError) {
      throw new Error("Impossible de charger les fiches de contrôle.", {
        cause: detailsError,
      });
    }
    productRows = productsResult.data ?? [];
    serviceRows = servicesResult.data ?? [];
    profileRows = profilesResult.data ?? [];
  }

  const productIds = productRows.map((product) => product.id);
  const imagesResult = productIds.length
    ? await supabase
        .from("product_images")
        .select("id, product_id, path, position")
        .in("product_id", productIds)
        .order("position")
    : { data: [], error: null };
  if (imagesResult.error) {
    throw new Error("Impossible de charger les photos du catalogue.", {
      cause: imagesResult.error,
    });
  }

  const photosByProduct = new Map<string, string[]>();
  for (const image of imagesResult.data ?? []) {
    const photos = photosByProduct.get(image.product_id) ?? [];
    photos.push(
      supabase.storage.from("shop-assets").getPublicUrl(image.path).data
        .publicUrl,
    );
    photosByProduct.set(image.product_id, photos);
  }

  const productsByShop = new Map<string, AdminShop["products"]>();
  for (const product of productRows) {
    const products = productsByShop.get(product.shop_id) ?? [];
    products.push({
      id: product.id,
      name: product.name,
      description: product.description,
      price: product.price,
      photos: photosByProduct.get(product.id) ?? [],
    });
    productsByShop.set(product.shop_id, products);
  }

  const servicesByShop = new Map<string, AdminShop["services"]>();
  for (const service of serviceRows) {
    const services = servicesByShop.get(service.shop_id) ?? [];
    services.push({
      id: service.id,
      name: service.name,
      description: service.description,
      price: service.price,
    });
    servicesByShop.set(service.shop_id, services);
  }

  const owners = new Map(profileRows.map((profile) => [profile.id, profile]));
  const shops: AdminShop[] = submitted.map((shop) => ({
    id: shop.id,
    name: shop.name,
    slug: shop.slug,
    category: shop.category,
    description: shop.description,
    logoUrl: shop.logo_path
      ? supabase.storage.from("shop-assets").getPublicUrl(shop.logo_path).data
          .publicUrl
      : null,
    createdAt: shop.created_at,
    submittedAt: shop.submitted_at,
    whatsapp: shop.whatsapp,
    phone: shop.phone,
    city: shop.city,
    district: shop.district,
    address: shop.address,
    ownerName: owners.get(shop.created_by)?.full_name ?? "Non renseigné",
    ownerPhone: owners.get(shop.created_by)?.phone ?? null,
    products: productsByShop.get(shop.id) ?? [],
    services: servicesByShop.get(shop.id) ?? [],
  }));
  const audit: AdminAuditEntry[] = (auditResult.data ?? []).map((entry) => ({
    id: entry.id,
    actorId: entry.actor_id,
    shopId: entry.shop_id,
    action: entry.action,
    entity: entry.entity,
    createdAt: entry.created_at,
    metadata: entry.metadata,
  }));

  return (
    <main className="admin-shell">
      <Link className="ui-button ui-button--secondary" href="/admin/review-reports">
        Modérer les avis signalés
      </Link>
      <AdminWorkspace
        audit={audit}
        approvedShops={approvedResult.data ?? []}
        shops={shops}
      />
    </main>
  );
}
