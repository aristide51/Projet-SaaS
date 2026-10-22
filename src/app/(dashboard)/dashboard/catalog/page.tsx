import Link from "next/link";
import { CatalogWorkspace } from "@/features/catalog/catalog-workspace";
import { requireVerifiedUser } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";

type CatalogPageProps = {
  searchParams: Promise<{ shop?: string; q?: string; view?: string }>;
};

export default async function CatalogPage({ searchParams }: CatalogPageProps) {
  const user = await requireVerifiedUser();
  const params = await searchParams;
  const supabase = await createClient();
  const { data: shops, error: shopsError } = await supabase
    .from("shops")
    .select("id, name")
    .order("created_at", { ascending: false });

  if (shopsError) {
    throw new Error("Impossible de charger tes boutiques.", {
      cause: shopsError,
    });
  }

  if (!shops?.length) {
    return (
      <main className="catalog-shell">
        <section className="catalog-card">
          <h1>Ton catalogue</h1>
          <p>Commence par créer une boutique pour gérer ses produits.</p>
          <Link
            className="ui-button ui-button--primary"
            href="/dashboard/onboarding"
          >
            Créer ma boutique
          </Link>
        </section>
      </main>
    );
  }

  const shop = params.shop
    ? shops.find((item) => item.id === params.shop)
    : shops[0];

  if (!shop) {
    return (
      <main className="catalog-shell">
        <section className="catalog-card" role="alert">
          <h1>Boutique introuvable</h1>
          <p>Tu n’as pas accès à cette boutique.</p>
        </section>
      </main>
    );
  }

  const { data: member, error: memberError } = await supabase
    .from("shop_members")
    .select("role, permissions")
    .eq("shop_id", shop.id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (memberError) {
    throw new Error("Impossible de vérifier les droits du catalogue.", {
      cause: memberError,
    });
  }

  const permissions =
    typeof member?.permissions === "object" &&
    member.permissions !== null &&
    !Array.isArray(member.permissions)
      ? member.permissions
      : {};

  if (!member || (member.role !== "owner" && permissions.catalog !== true)) {
    return (
      <main className="catalog-shell">
        <section className="catalog-card" role="alert">
          <h1>Accès refusé</h1>
          <p>
            Ton compte n’a pas la permission « catalogue » pour cette boutique.
            Demande au propriétaire de modifier tes droits.
          </p>
        </section>
      </main>
    );
  }

  const isTrash = params.view === "trash";
  const query = params.q?.trim().slice(0, 160) ?? "";
  const { data: productIds, error: productIdsError } = isTrash
    ? await supabase.rpc("catalog_trash_product_ids", { p_shop: shop.id })
    : await supabase.rpc("search_catalog_products", {
        p_shop: shop.id,
        p_query: query,
      });
  const { data: serviceIds, error: serviceIdsError } = isTrash
    ? await supabase.rpc("catalog_trash_service_ids", { p_shop: shop.id })
    : { data: [], error: null };

  if (productIdsError || serviceIdsError) {
    throw new Error("Impossible de rechercher dans le catalogue.", {
      cause: productIdsError ?? serviceIdsError,
    });
  }

  const productsQuery = supabase
    .from("products")
    .select(
      "id, shop_id, category_id, name, description, price, compare_at_price, sku, compatibility, stock, status, is_sample, deleted_at, created_at, updated_at",
    )
    .eq("shop_id", shop.id)
    .order("created_at", { ascending: false });
  const productsResult = isTrash
    ? productIds?.length
      ? await productsQuery.in("id", productIds)
      : { data: [], error: null }
    : productIds?.length
      ? await productsQuery.in("id", productIds)
      : { data: [], error: null };

  if (productsResult.error) {
    throw new Error("Impossible de charger les produits.", {
      cause: productsResult.error,
    });
  }

  const products = productsResult.data ?? [];
  const productIdsForRelations = products.map((product) => product.id);
  const [
    categoriesResult,
    servicesResult,
    imageResult,
    variantResult,
    countResult,
    limitResult,
  ] = await Promise.all([
    supabase
      .from("categories")
      .select("id, shop_id, parent_id, name, position")
      .eq("shop_id", shop.id)
      .order("position")
      .order("name"),
    isTrash && serviceIds?.length
      ? supabase
          .from("services")
          .select(
            "id, shop_id, name, description, duration_min, price, deposit_amount, active, is_sample, deleted_at, created_at, updated_at",
          )
          .eq("shop_id", shop.id)
          .in("id", serviceIds)
          .order("created_at", { ascending: false })
      : isTrash
        ? Promise.resolve({ data: [], error: null })
        : supabase
            .from("services")
            .select(
              "id, shop_id, name, description, duration_min, price, deposit_amount, active, is_sample, deleted_at, created_at, updated_at",
            )
            .eq("shop_id", shop.id)
            .is("deleted_at", null)
            .order("created_at", { ascending: false }),
    productIdsForRelations.length
      ? supabase
          .from("product_images")
          .select("id, shop_id, product_id, path, position, created_at")
          .eq("shop_id", shop.id)
          .in("product_id", productIdsForRelations)
          .order("position")
      : Promise.resolve({ data: [], error: null }),
    productIdsForRelations.length
      ? supabase
          .from("product_variants")
          .select("id, shop_id, product_id, name, price, stock")
          .eq("shop_id", shop.id)
          .in("product_id", productIdsForRelations)
          .order("name")
      : Promise.resolve({ data: [], error: null }),
    supabase
      .from("products")
      .select("id", { count: "exact", head: true })
      .eq("shop_id", shop.id)
      .eq("is_sample", false)
      .is("deleted_at", null),
    supabase.rpc("catalog_product_limit", { p_shop: shop.id }),
  ]);

  for (const result of [
    categoriesResult,
    servicesResult,
    imageResult,
    variantResult,
    countResult,
    limitResult,
  ]) {
    if (result.error) {
      throw new Error("Impossible de charger les données du catalogue.", {
        cause: result.error,
      });
    }
  }

  const serviceIdsForImages = (servicesResult.data ?? []).map(
    (service) => service.id,
  );
  const serviceImageResult = serviceIdsForImages.length
    ? await supabase
        .from("service_images")
        .select("id, shop_id, service_id, path, position, created_at")
        .eq("shop_id", shop.id)
        .in("service_id", serviceIdsForImages)
        .order("position")
    : { data: [], error: null };

  if (serviceImageResult.error) {
    throw new Error("Impossible de charger les photos des services.", {
      cause: serviceImageResult.error,
    });
  }

  const productsWithAssets = products.map((product) => ({
    ...product,
    images: (imageResult.data ?? [])
      .filter((image) => image.product_id === product.id)
      .map((image) => ({
        id: image.id,
        path: image.path,
        position: image.position,
        url: supabase.storage.from("shop-assets").getPublicUrl(image.path).data
          .publicUrl,
      })),
    variants: (variantResult.data ?? [])
      .filter((variant) => variant.product_id === product.id)
      .map((variant) => ({
        id: variant.id,
        name: variant.name,
        price: variant.price,
        stock: variant.stock,
      })),
  }));
  const servicesWithAssets = (servicesResult.data ?? []).map((service) => ({
    ...service,
    images: (serviceImageResult.data ?? [])
      .filter((image) => image.service_id === service.id)
      .map((image) => ({
        id: image.id,
        path: image.path,
        position: image.position,
        url: supabase.storage.from("shop-assets").getPublicUrl(image.path).data
          .publicUrl,
      })),
  }));

  return (
    <main className="catalog-shell">
      <CatalogWorkspace
        categories={categoriesResult.data ?? []}
        initialQuery={query}
        isTrash={isTrash}
        maxProducts={limitResult.data}
        productCount={countResult.count ?? 0}
        products={productsWithAssets}
        services={servicesWithAssets}
        shopId={shop.id}
        shopName={shop.name}
        shops={shops}
      />
    </main>
  );
}
