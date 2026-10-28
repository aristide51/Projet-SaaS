import { unstable_cache } from "next/cache";
import {
  createClient as createSupabaseClient,
  type SupabaseClient,
} from "@supabase/supabase-js";
import { validateServerEnv } from "@/lib/env";
import type { Database, Json } from "@/types/database";
import { PUBLIC_SHOPS_CACHE_TAG, publicShopCacheTag } from "./cache";

let publicClient: SupabaseClient<Database> | undefined;

export type PublicShop = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  category: Database["public"]["Enums"]["shop_category"];
  logo_path: string | null;
  brand_color: string;
  whatsapp: string | null;
  phone: string | null;
  city: string;
  district: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  opening_hours: Json;
  rating_avg: number;
  rating_count: number;
};

export type StorefrontProduct = {
  id: string;
  name: string;
  description: string | null;
  price: number;
  compare_at_price: number | null;
  category_id: string | null;
  status: string;
  item_type: "product" | "service";
};

export type StorefrontCategory = {
  id: string;
  name: string;
  parent_id: string | null;
  position: number;
};

export type StorefrontImage = {
  product_id: string | null;
  service_id: string | null;
  path: string;
  position: number;
};

export type StorefrontReview =
  Database["public"]["Functions"]["storefront_reviews"]["Returns"][number];

export type StorefrontCatalog = {
  categories: StorefrontCategory[];
  items: StorefrontProduct[];
  images: StorefrontImage[];
};

export type ShopDirectoryFilters = {
  query: string;
  city: string;
  district: string;
  category: Database["public"]["Enums"]["shop_category"] | null;
  openNow: boolean;
  minimumRating: number | null;
  hasPromotion: boolean;
  sort: "relevance" | "distance" | "rating";
  latitude: number | null;
  longitude: number | null;
  cursor: { value: number; id: string } | null;
};

export type ShopDirectoryEntry =
  Database["public"]["Functions"]["search_shops"]["Returns"][number];

export type PublicSitemapEntry = {
  urlPath: string;
  lastModified: string;
};

export type PublicProductLinkTarget = {
  shopId: string;
  shopSlug: string;
};

function createPublicClient() {
  if (publicClient) return publicClient;

  const { NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY } =
    validateServerEnv();
  publicClient = createSupabaseClient<Database>(
    NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      auth: {
        autoRefreshToken: false,
        detectSessionInUrl: false,
        persistSession: false,
      },
    },
  );
  return publicClient;
}

export function getPublicStorageUrl(path: string) {
  return createPublicClient().storage.from("shop-assets").getPublicUrl(path)
    .data.publicUrl;
}

export function getReviewPhotoUrl(path: string) {
  return createPublicClient().storage.from("review-photos").getPublicUrl(path)
    .data.publicUrl;
}

export function getStorefrontReviews(
  shopId: string,
  productId: string | null = null,
) {
  return unstable_cache(
    async (): Promise<StorefrontReview[]> => {
      const { data, error } = await createPublicClient().rpc(
        "storefront_reviews",
        {
          p_shop_id: shopId,
          ...(productId ? { p_product_id: productId } : {}),
          p_limit: 20,
        },
      );
      if (error) {
        throw new Error("Impossible de charger les avis.", { cause: error });
      }
      return data ?? [];
    },
    ["storefront-reviews", shopId, productId ?? "shop"],
    {
      tags: [publicShopCacheTag(shopId)],
      revalidate: 1800,
    },
  )();
}

export function getPublicShop(slug: string) {
  return unstable_cache(
    async (): Promise<PublicShop | null> => {
      const { data, error } = await createPublicClient()
        .from("shops")
        .select(
          "id, slug, name, description, category, logo_path, brand_color, whatsapp, phone, city, district, address, lat, lng, opening_hours, rating_avg, rating_count",
        )
        .eq("slug", slug)
        .eq("review_status", "approved")
        .eq("is_suspended", false)
        .maybeSingle();

      if (error) {
        throw new Error("Impossible de charger cette boutique.", {
          cause: error,
        });
      }

      return data;
    },
    ["storefront-shop-by-slug", slug],
    {
      tags: [PUBLIC_SHOPS_CACHE_TAG, `storefront:slug:${slug}`],
      revalidate: 3600,
    },
  )();
}

export function getPublicProductLinkTarget(productId: string) {
  return unstable_cache(
    async (): Promise<PublicProductLinkTarget | null> => {
      const supabase = createPublicClient();
      const { data: product, error: productError } = await supabase
        .from("products")
        .select("id, shop_id")
        .eq("id", productId)
        .eq("is_sample", false)
        .is("deleted_at", null)
        .neq("status", "hidden")
        .maybeSingle();

      if (productError) {
        throw new Error("Impossible de retrouver ce produit partagé.", {
          cause: productError,
        });
      }
      if (!product) return null;

      const { data: shop, error: shopError } = await supabase
        .from("shops")
        .select("slug")
        .eq("id", product.shop_id)
        .eq("review_status", "approved")
        .eq("is_suspended", false)
        .maybeSingle();

      if (shopError) {
        throw new Error("Impossible de retrouver la boutique de ce produit.", {
          cause: shopError,
        });
      }
      if (!shop) return null;

      return { shopId: product.shop_id, shopSlug: shop.slug };
    },
    ["public-product-link-target", productId],
    { tags: [PUBLIC_SHOPS_CACHE_TAG], revalidate: 300 },
  )();
}

export async function recordPublicStorefrontVisit(
  shopId: string,
  productId?: string,
) {
  const { error } = await createPublicClient().rpc(
    "record_public_storefront_visit",
    {
      p_shop_id: shopId,
      ...(productId ? { p_product_id: productId } : {}),
    },
  );
  if (error) {
    throw new Error("Impossible d’enregistrer la visite anonyme.", {
      cause: error,
    });
  }
}

export function searchPublicShops(filters: ShopDirectoryFilters) {
  return unstable_cache(
    async (): Promise<ShopDirectoryEntry[]> => {
      const { data, error } = await createPublicClient().rpc("search_shops", {
        ...(filters.query ? { p_query: filters.query } : {}),
        ...(filters.city ? { p_city: filters.city } : {}),
        ...(filters.district ? { p_district: filters.district } : {}),
        ...(filters.category ? { p_category: filters.category } : {}),
        p_open_now: filters.openNow,
        ...(filters.minimumRating !== null
          ? { p_min_rating: filters.minimumRating }
          : {}),
        p_has_promotion: filters.hasPromotion,
        p_sort: filters.sort,
        ...(filters.latitude !== null ? { p_lat: filters.latitude } : {}),
        ...(filters.longitude !== null ? { p_lng: filters.longitude } : {}),
        ...(filters.cursor
          ? {
              p_cursor_value: filters.cursor.value,
              p_cursor_id: filters.cursor.id,
            }
          : {}),
        p_limit: 13,
      });

      if (error) {
        throw new Error("Impossible de rechercher les boutiques.", {
          cause: error,
        });
      }

      return data ?? [];
    },
    ["public-shop-directory", JSON.stringify(filters)],
    { tags: [PUBLIC_SHOPS_CACHE_TAG], revalidate: 300 },
  )();
}

export function getPublicSitemapEntries() {
  return unstable_cache(
    async (): Promise<PublicSitemapEntry[]> => {
      const supabase = createPublicClient();
      const shops: {
        id: string;
        slug: string;
        updated_at: string;
      }[] = [];
      const pageSize = 1000;

      for (let offset = 0; ; offset += pageSize) {
        const { data, error } = await supabase
          .from("shops")
          .select("id, slug, updated_at")
          .eq("review_status", "approved")
          .eq("is_suspended", false)
          .order("id")
          .range(offset, offset + pageSize - 1);

        if (error) {
          throw new Error("Impossible de charger le sitemap des boutiques.", {
            cause: error,
          });
        }

        shops.push(...(data ?? []));
        if (!data || data.length < pageSize) break;
      }

      const shopSlugs = new Map(shops.map((shop) => [shop.id, shop.slug]));
      const products: {
        id: string;
        shop_id: string;
        updated_at: string;
      }[] = [];

      for (let offset = 0; ; offset += pageSize) {
        const { data, error } = await supabase
          .from("products")
          .select("id, shop_id, updated_at")
          .eq("is_sample", false)
          .is("deleted_at", null)
          .neq("status", "hidden")
          .order("id")
          .range(offset, offset + pageSize - 1);

        if (error) {
          throw new Error("Impossible de charger le sitemap des produits.", {
            cause: error,
          });
        }

        products.push(...(data ?? []));
        if (!data || data.length < pageSize) break;
      }

      return [
        ...shops.map((shop) => ({
          urlPath: `/${encodeURIComponent(shop.slug)}`,
          lastModified: shop.updated_at,
        })),
        ...products.flatMap((product) => {
          const slug = shopSlugs.get(product.shop_id);
          return slug
            ? [
                {
                  urlPath: `/${encodeURIComponent(slug)}/products/${product.id}`,
                  lastModified: product.updated_at,
                },
              ]
            : [];
        }),
      ];
    },
    ["public-sitemap-entries"],
    { tags: [PUBLIC_SHOPS_CACHE_TAG], revalidate: 3600 },
  )();
}

export function getPublicCatalog(
  shopId: string,
  query: string,
  categoryId: string | null,
) {
  const normalizedQuery = query.trim().slice(0, 100);

  return unstable_cache(
    async (): Promise<StorefrontCatalog> => {
      const supabase = createPublicClient();
      const categoriesQuery = supabase
        .from("categories")
        .select("id, name, parent_id, position")
        .eq("shop_id", shopId)
        .order("position")
        .order("name");

      const itemsQuery = normalizedQuery
        ? supabase.rpc("search_public_storefront_products", {
            p_shop: shopId,
            p_query: normalizedQuery,
            ...(categoryId ? { p_category: categoryId } : {}),
          })
        : supabase
            .from("products")
            .select(
              "id, name, description, price, compare_at_price, category_id, status",
            )
            .eq("shop_id", shopId)
            .eq("is_sample", false)
            .is("deleted_at", null)
            .neq("status", "hidden")
            .order("created_at", { ascending: false })
            .limit(60);

      const servicesQuery =
        categoryId || normalizedQuery
          ? Promise.resolve({ data: [], error: null })
          : (() => {
              let services = supabase
                .from("services")
                .select("id, name, description, price")
                .eq("shop_id", shopId)
                .eq("active", true)
                .eq("is_sample", false)
                .is("deleted_at", null)
                .order("created_at", { ascending: false })
                .limit(60);
              if (normalizedQuery) {
                const escapedQuery = normalizedQuery.replace(/[\\%_]/g, "\\$&");
                services = services.ilike("name", `%${escapedQuery}%`);
              }
              return services;
            })();

      const [categoriesResult, itemsResult, servicesResult] = await Promise.all(
        [categoriesQuery, itemsQuery, servicesQuery],
      );
      const queryError =
        categoriesResult.error ?? itemsResult.error ?? servicesResult.error;

      if (queryError) {
        throw new Error(
          "Impossible de charger le catalogue de cette boutique.",
          {
            cause: queryError,
          },
        );
      }

      const rawItems = itemsResult.data ?? [];
      const productItems: StorefrontProduct[] = rawItems.flatMap((item) => {
        if ("item_type" in item && item.item_type === "service") return [];
        return [
          {
            id: item.id,
            name: item.name,
            description: item.description ?? null,
            price: item.price,
            compare_at_price: item.compare_at_price ?? null,
            category_id: item.category_id ?? null,
            status: item.status,
            item_type: "product",
          },
        ];
      });
      const searchedServiceItems: StorefrontProduct[] = rawItems.flatMap(
        (item) => {
          if (!("item_type" in item) || item.item_type !== "service") return [];
          return [
            {
              id: item.id,
              name: item.name,
              description: item.description ?? null,
              price: item.price,
              compare_at_price: null,
              category_id: null,
              status: "available",
              item_type: "service",
            },
          ];
        },
      );
      const serviceItems: StorefrontProduct[] = [
        ...searchedServiceItems,
        ...(servicesResult.data ?? []).map((item) => ({
          id: item.id,
          name: item.name,
          description: item.description,
          price: item.price,
          compare_at_price: null,
          category_id: null,
          status: "available",
          item_type: "service" as const,
        })),
      ];
      const items = [...productItems, ...serviceItems];
      const productIds = productItems.map((item) => item.id);
      const serviceIds = serviceItems.map((item) => item.id);
      const imageQueries = [];

      if (productIds.length) {
        imageQueries.push(
          supabase
            .from("product_images")
            .select("product_id, path, position")
            .eq("shop_id", shopId)
            .in("product_id", productIds)
            .order("position"),
        );
      }
      if (serviceIds.length) {
        imageQueries.push(
          supabase
            .from("service_images")
            .select("service_id, path, position")
            .eq("shop_id", shopId)
            .in("service_id", serviceIds)
            .order("position"),
        );
      }

      const imageResults = await Promise.all(imageQueries);
      const imageError = imageResults.find((result) => result.error)?.error;
      if (imageError) {
        throw new Error("Impossible de charger les images du catalogue.", {
          cause: imageError,
        });
      }

      return {
        categories: categoriesResult.data ?? [],
        items,
        images: imageResults.flatMap((result) =>
          (result.data ?? []).map((image) => ({
            product_id: "product_id" in image ? image.product_id : null,
            service_id: "service_id" in image ? image.service_id : null,
            path: image.path,
            position: image.position,
          })),
        ),
      };
    },
    [
      "storefront-catalog",
      shopId,
      normalizedQuery,
      categoryId ?? "all-categories",
    ],
    {
      tags: [publicShopCacheTag(shopId)],
      revalidate: 1800,
    },
  )();
}

export function getPublicProduct(shopId: string, productId: string) {
  return unstable_cache(
    async () => {
      const supabase = createPublicClient();
      const { data: product, error } = await supabase
        .from("products")
        .select(
          "id, name, description, price, compare_at_price, category_id, status",
        )
        .eq("id", productId)
        .eq("shop_id", shopId)
        .eq("is_sample", false)
        .is("deleted_at", null)
        .neq("status", "hidden")
        .maybeSingle();

      if (error) {
        throw new Error("Impossible de charger ce produit.", { cause: error });
      }
      if (!product) return null;

      const [imagesResult, categoryResult, variantsResult] = await Promise.all([
        supabase
          .from("product_images")
          .select("path, position")
          .eq("shop_id", shopId)
          .eq("product_id", productId)
          .order("position"),
        product.category_id
          ? supabase
              .from("categories")
              .select("name")
              .eq("id", product.category_id)
              .eq("shop_id", shopId)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null }),
        supabase
          .from("product_variants")
          .select("id, name, price, stock")
          .eq("shop_id", shopId)
          .eq("product_id", productId)
          .order("name"),
      ]);
      const relatedError =
        imagesResult.error ?? categoryResult.error ?? variantsResult.error;
      if (relatedError) {
        throw new Error("Impossible de charger les détails du produit.", {
          cause: relatedError,
        });
      }

      return {
        ...product,
        category_name: categoryResult.data?.name ?? null,
        images: imagesResult.data ?? [],
        variants: (variantsResult.data ?? []).map((variant) => ({
          id: variant.id,
          name: variant.name,
          price: variant.price,
          available: variant.stock === null || variant.stock > 0,
        })),
      };
    },
    ["storefront-product", shopId, productId],
    {
      tags: [publicShopCacheTag(shopId)],
      revalidate: 1800,
    },
  )();
}
