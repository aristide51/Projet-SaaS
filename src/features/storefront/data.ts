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

export type StorefrontCatalog = {
  categories: StorefrontCategory[];
  items: StorefrontProduct[];
  images: StorefrontImage[];
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
