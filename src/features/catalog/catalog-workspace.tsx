"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useRef, useState, type FormEvent } from "react";
import { Badge } from "@/components/ui/primitives";
import {
  deleteCategory,
  deleteProductImage,
  deleteServiceImage,
  reorderProductImages,
  reorderServiceImages,
  saveCategory,
  saveProduct,
  saveService,
  seedCatalogSamples,
  setCatalogItemDeleted,
  uploadProductImage,
  uploadServiceImage,
} from "./actions";
import { convertImageToWebp } from "./image-processing";
import type { SampleShopType } from "./sample-products";

type Category = {
  id: string;
  shop_id: string;
  parent_id: string | null;
  name: string;
  position: number;
};
type Variant = {
  id: string | null;
  name: string;
  price: number | null;
  stock: number | null;
};
type CatalogImage = {
  id: string;
  path: string;
  position: number;
  url: string;
};
type Product = {
  id: string;
  name: string;
  description: string | null;
  category_id: string | null;
  price: number;
  compare_at_price: number | null;
  sku: string | null;
  compatibility: string | null;
  stock: number | null;
  status: "available" | "out_of_stock" | "hidden";
  deleted_at: string | null;
  is_sample: boolean;
  images: CatalogImage[];
  variants: Variant[];
};
type Service = {
  id: string;
  name: string;
  description: string | null;
  duration_min: number;
  price: number;
  deposit_amount: number;
  active: boolean;
  is_sample: boolean;
  deleted_at: string | null;
  images: CatalogImage[];
};
type ShopOption = { id: string; name: string };
type ProductForm = {
  id: string | null;
  categoryId: string;
  name: string;
  description: string;
  price: number;
  compareAtPrice: number | null;
  sku: string;
  compatibility: string;
  stock: number | null;
  status: Product["status"];
  variants: Variant[];
};
type ServiceForm = {
  id: string | null;
  name: string;
  description: string;
  durationMin: number;
  price: number;
  depositAmount: number;
  active: boolean;
};

const emptyProduct: ProductForm = {
  id: null,
  categoryId: "",
  name: "",
  description: "",
  price: 0,
  compareAtPrice: null,
  sku: "",
  compatibility: "",
  stock: null,
  status: "available",
  variants: [],
};

const emptyService: ServiceForm = {
  id: null,
  name: "",
  description: "",
  durationMin: 60,
  price: 0,
  depositAmount: 0,
  active: true,
};

const sampleTypes: { value: SampleShopType; label: string }[] = [
  { value: "hardware", label: "Quincaillerie" },
  { value: "auto_parts", label: "Pièces détachées" },
  { value: "garage", label: "Garage" },
  { value: "salon", label: "Salon" },
];

export function CatalogWorkspace({
  shopId,
  shopName,
  shops,
  categories,
  products,
  services,
  productCount,
  maxProducts,
  initialQuery,
  isTrash,
}: {
  shopId: string;
  shopName: string;
  shops: ShopOption[];
  categories: Category[];
  products: Product[];
  services: Service[];
  productCount: number;
  maxProducts: number | null;
  initialQuery: string;
  isTrash: boolean;
}) {
  const router = useRouter();
  const imageInput = useRef<HTMLInputElement>(null);
  const serviceImageInput = useRef<HTMLInputElement>(null);
  const [productForm, setProductForm] = useState<ProductForm>(emptyProduct);
  const [serviceForm, setServiceForm] = useState<ServiceForm>(emptyService);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [categoryName, setCategoryName] = useState("");
  const [categoryParent, setCategoryParent] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState(initialQuery);
  const [selectedImages, setSelectedImages] = useState<File[]>([]);
  const [selectedServiceImages, setSelectedServiceImages] = useState<File[]>(
    [],
  );
  const [sampleType, setSampleType] = useState<SampleShopType>("hardware");

  async function submitCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    const result = await saveCategory(shopId, {
      id: categoryId,
      parentId: categoryParent || null,
      name: categoryName,
    });
    setBusy(false);
    setMessage(result.message);
    if (result.success) {
      setCategoryId(null);
      setCategoryParent("");
      setCategoryName("");
      router.refresh();
    }
  }

  async function submitProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    const result = await saveProduct(shopId, {
      ...productForm,
      categoryId: productForm.categoryId || null,
      variants: productForm.variants,
    });
    if (!result.success || !result.id) {
      setBusy(false);
      setMessage(result.message);
      return;
    }

    let imageWarning = "";
    let pendingAfterFailure: File[] = [];
    for (const [index, sourceFile] of selectedImages.entries()) {
      try {
        const webp = await convertImageToWebp(sourceFile);
        const uploadResult = await uploadProductImage(shopId, result.id, webp);
        if (!uploadResult.success) {
          imageWarning = uploadResult.message;
          pendingAfterFailure = selectedImages.slice(index);
          break;
        }
      } catch (error) {
        imageWarning =
          error instanceof Error
            ? error.message
            : "Une image n’a pas pu être compressée.";
        pendingAfterFailure = selectedImages.slice(index);
        break;
      }
    }

    setBusy(false);
    setProductForm((previous) => ({
      ...previous,
      id: result.id ?? previous.id,
      variants: result.variants ?? previous.variants,
    }));
    setMessage(
      imageWarning
        ? `${result.message} ${imageWarning}`
        : selectedImages.length
          ? `${result.message} Images ajoutées.`
          : result.message,
    );
    if (!imageWarning) {
      setProductForm(emptyProduct);
      setSelectedImages([]);
      if (imageInput.current) imageInput.current.value = "";
      router.refresh();
    } else {
      setSelectedImages(pendingAfterFailure);
      if (imageInput.current) imageInput.current.value = "";
      router.refresh();
    }
  }

  async function submitService(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    const result = await saveService(shopId, serviceForm);
    if (!result.success || !result.id) {
      setBusy(false);
      setMessage(result.message);
      return;
    }

    let imageWarning = "";
    let pendingAfterFailure: File[] = [];
    for (const [index, sourceFile] of selectedServiceImages.entries()) {
      try {
        const webp = await convertImageToWebp(sourceFile);
        const uploadResult = await uploadServiceImage(shopId, result.id, webp);
        if (!uploadResult.success) {
          imageWarning = uploadResult.message;
          pendingAfterFailure = selectedServiceImages.slice(index);
          break;
        }
      } catch (error) {
        imageWarning =
          error instanceof Error
            ? error.message
            : "Une photo n’a pas pu être compressée.";
        pendingAfterFailure = selectedServiceImages.slice(index);
        break;
      }
    }

    setBusy(false);
    setServiceForm((previous) => ({
      ...previous,
      id: result.id ?? previous.id,
    }));
    setMessage(
      imageWarning
        ? `${result.message} ${imageWarning}`
        : selectedServiceImages.length
          ? `${result.message} Photos ajoutées.`
          : result.message,
    );
    if (!imageWarning) {
      setServiceForm(emptyService);
      setSelectedServiceImages([]);
      if (serviceImageInput.current) serviceImageInput.current.value = "";
      router.refresh();
    } else {
      setSelectedServiceImages(pendingAfterFailure);
      if (serviceImageInput.current) serviceImageInput.current.value = "";
      router.refresh();
    }
  }

  async function addSampleCatalog() {
    setBusy(true);
    const result = await seedCatalogSamples(shopId, sampleType);
    setBusy(false);
    setMessage(result.message);
    if (result.success) router.refresh();
  }

  async function archiveItem(
    kind: "product" | "service",
    id: string,
    deleted: boolean,
  ) {
    const result = await setCatalogItemDeleted(shopId, kind, id, deleted);
    setMessage(result.message);
    if (result.success) router.refresh();
  }

  async function removeImage(product: Product, imageId: string) {
    const result = await deleteProductImage(shopId, product.id, imageId);
    setMessage(result.message);
    if (result.success) router.refresh();
  }

  async function removeServiceImage(service: Service, imageId: string) {
    const result = await deleteServiceImage(shopId, service.id, imageId);
    setMessage(result.message);
    if (result.success) router.refresh();
  }

  async function moveImage(
    product: Product,
    imageId: string,
    direction: -1 | 1,
  ) {
    const currentIndex = product.images.findIndex(
      (image) => image.id === imageId,
    );
    const nextIndex = currentIndex + direction;
    if (nextIndex < 0 || nextIndex >= product.images.length) return;
    const ids = product.images.map((image) => image.id);
    const currentImage = ids[currentIndex];
    const nextImage = ids[nextIndex];
    if (!currentImage || !nextImage) return;
    ids[currentIndex] = nextImage;
    ids[nextIndex] = currentImage;
    const result = await reorderProductImages(shopId, product.id, ids);
    setMessage(result.message);
    if (result.success) router.refresh();
  }

  async function moveServiceImage(
    service: Service,
    imageId: string,
    direction: -1 | 1,
  ) {
    const currentIndex = service.images.findIndex(
      (image) => image.id === imageId,
    );
    const nextIndex = currentIndex + direction;
    if (nextIndex < 0 || nextIndex >= service.images.length) return;
    const ids = service.images.map((image) => image.id);
    const currentImage = ids[currentIndex];
    const nextImage = ids[nextIndex];
    if (!currentImage || !nextImage) return;
    ids[currentIndex] = nextImage;
    ids[nextIndex] = currentImage;
    const result = await reorderServiceImages(shopId, service.id, ids);
    setMessage(result.message);
    if (result.success) router.refresh();
  }

  const canAddProduct = maxProducts === null || productCount < maxProducts;
  const remaining =
    maxProducts === null ? null : Math.max(0, maxProducts - productCount);
  const search = initialQuery.toLocaleLowerCase("fr");
  const filteredServices = services.filter(
    (service) =>
      !search ||
      service.name.toLocaleLowerCase("fr").includes(search) ||
      service.description?.toLocaleLowerCase("fr").includes(search),
  );

  return (
    <div className="catalog-layout">
      <header className="catalog-header">
        <div>
          <p className="auth-eyebrow">Espace commerçant</p>
          <h1>Catalogue</h1>
          <p>Gère les produits et les services de {shopName}.</p>
        </div>
        {shops.length > 1 ? (
          <label className="catalog-shop-select">
            <span>Boutique</span>
            <select
              value={shopId}
              onChange={(event) => {
                router.push(
                  `/dashboard/catalog?shop=${encodeURIComponent(event.target.value)}`,
                );
              }}
            >
              {shops.map((shop) => (
                <option key={shop.id} value={shop.id}>
                  {shop.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </header>

      <nav aria-label="Sections du catalogue" className="catalog-nav">
        <Link
          aria-current={!isTrash ? "page" : undefined}
          href={`/dashboard/catalog?shop=${encodeURIComponent(shopId)}`}
        >
          Produits et services
        </Link>
        <Link
          aria-current={isTrash ? "page" : undefined}
          href={`/dashboard/catalog?shop=${encodeURIComponent(shopId)}&view=trash`}
        >
          Corbeille
        </Link>
        {!isTrash ? (
          <Link
            className="ui-button ui-button--secondary ui-button--sm"
            href={`/dashboard/catalog/import?shop=${encodeURIComponent(shopId)}`}
          >
            Importer un CSV
          </Link>
        ) : null}
      </nav>

      {message ? (
        <p className="catalog-message" role="status">
          {message}
        </p>
      ) : null}

      {!isTrash ? (
        <>
          {maxProducts !== null ? (
            <section className="catalog-quota" aria-live="polite">
              <div>
                <strong>
                  {productCount} / {maxProducts} produits utilisés
                </strong>
                <p>
                  {remaining
                    ? `Il te reste ${remaining} ajout${remaining > 1 ? "s" : ""} sur le plan Gratuit.`
                    : "La limite du plan Gratuit est atteinte."}
                </p>
              </div>
              {remaining === 0 ? (
                <p>
                  Mets un produit à la corbeille ou passe à un plan supérieur
                  pour en ajouter un.
                </p>
              ) : null}
            </section>
          ) : null}

          <form
            action="/dashboard/catalog"
            className="catalog-search"
            method="get"
          >
            <input name="shop" type="hidden" value={shopId} />
            <label className="catalog-search-field">
              <span>Rechercher un produit</span>
              <input
                autoComplete="off"
                name="q"
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Nom, référence ou compatibilité"
                type="search"
                value={query}
              />
            </label>
            <button className="ui-button ui-button--secondary" type="submit">
              Rechercher
            </button>
          </form>

          <section className="catalog-section">
            <h2>Exemples prêts à modifier</h2>
            <p>
              Les exemples restent invisibles sur ta vitrine jusqu’à ce que tu
              les modifies.
            </p>
            <div className="catalog-form-actions">
              <label>
                Type de commerce
                <select
                  onChange={(event) => {
                    const selected = sampleTypes.find(
                      (type) => type.value === event.target.value,
                    );
                    if (selected) setSampleType(selected.value);
                  }}
                  value={sampleType}
                >
                  {sampleTypes.map((type) => (
                    <option key={type.value} value={type.value}>
                      {type.label}
                    </option>
                  ))}
                </select>
              </label>
              <button
                className="ui-button ui-button--secondary"
                disabled={busy}
                onClick={() => void addSampleCatalog()}
                type="button"
              >
                Ajouter les exemples
              </button>
            </div>
          </section>

          <section className="catalog-section">
            <h2>Catégories</h2>
            <form
              className="catalog-form catalog-category-form"
              onSubmit={submitCategory}
            >
              <label>
                Nom
                <input
                  maxLength={80}
                  onChange={(event) => setCategoryName(event.target.value)}
                  required
                  value={categoryName}
                />
              </label>
              <label>
                Sous-catégorie de
                <select
                  onChange={(event) => setCategoryParent(event.target.value)}
                  value={categoryParent}
                >
                  <option value="">Aucune (catégorie principale)</option>
                  {categories
                    .filter((category) => category.id !== categoryId)
                    .map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                </select>
              </label>
              <div className="catalog-form-actions">
                <button
                  className="ui-button ui-button--primary"
                  disabled={busy}
                  type="submit"
                >
                  {categoryId ? "Enregistrer" : "Ajouter une catégorie"}
                </button>
                {categoryId ? (
                  <button
                    className="ui-button ui-button--ghost"
                    onClick={() => {
                      setCategoryId(null);
                      setCategoryName("");
                      setCategoryParent("");
                    }}
                    type="button"
                  >
                    Annuler
                  </button>
                ) : null}
              </div>
            </form>
            {categories.length ? (
              <ul className="catalog-category-list">
                {categories.map((category) => (
                  <li key={category.id}>
                    <span>
                      {category.parent_id ? "↳ " : ""}
                      {category.name}
                    </span>
                    <div>
                      <button
                        className="ui-button ui-button--ghost ui-button--sm"
                        onClick={() => {
                          setCategoryId(category.id);
                          setCategoryName(category.name);
                          setCategoryParent(category.parent_id ?? "");
                        }}
                        type="button"
                      >
                        Modifier
                      </button>
                      <button
                        className="ui-button ui-button--ghost ui-button--sm"
                        onClick={async () => {
                          if (
                            window.confirm(`Supprimer « ${category.name} » ?`)
                          ) {
                            const result = await deleteCategory(
                              shopId,
                              category.id,
                            );
                            setMessage(result.message);
                            if (result.success) router.refresh();
                          }
                        }}
                        type="button"
                      >
                        Supprimer
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="catalog-muted">Aucune catégorie pour le moment.</p>
            )}
          </section>

          <section className="catalog-section">
            <h2>Produits</h2>
            {canAddProduct || productForm.id ? (
              <details
                className="catalog-editor"
                open={!products.length || Boolean(productForm.id)}
              >
                <summary>
                  {productForm.id
                    ? "Modifier le produit"
                    : "Ajouter un produit"}
                </summary>
                <form className="catalog-form" onSubmit={submitProduct}>
                  <div className="catalog-form-grid">
                    <label>
                      Nom du produit
                      <input
                        maxLength={160}
                        onChange={(event) =>
                          setProductForm({
                            ...productForm,
                            name: event.target.value,
                          })
                        }
                        required
                        value={productForm.name}
                      />
                    </label>
                    <label>
                      Prix (FCFA)
                      <input
                        min={0}
                        onChange={(event) =>
                          setProductForm({
                            ...productForm,
                            price: Number(event.target.value),
                          })
                        }
                        required
                        type="number"
                        value={productForm.price}
                      />
                    </label>
                    <label>
                      Prix barré (FCFA, facultatif)
                      <input
                        min={0}
                        onChange={(event) =>
                          setProductForm({
                            ...productForm,
                            compareAtPrice: event.target.value
                              ? Number(event.target.value)
                              : null,
                          })
                        }
                        type="number"
                        value={productForm.compareAtPrice ?? ""}
                      />
                    </label>
                    <label>
                      Catégorie
                      <select
                        onChange={(event) =>
                          setProductForm({
                            ...productForm,
                            categoryId: event.target.value,
                          })
                        }
                        value={productForm.categoryId}
                      >
                        <option value="">Sans catégorie</option>
                        {categories.map((category) => (
                          <option key={category.id} value={category.id}>
                            {category.parent_id ? "↳ " : ""}
                            {category.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      SKU / référence
                      <input
                        maxLength={60}
                        onChange={(event) =>
                          setProductForm({
                            ...productForm,
                            sku: event.target.value,
                          })
                        }
                        value={productForm.sku}
                      />
                    </label>
                    <label>
                      Compatibilité
                      <input
                        maxLength={500}
                        onChange={(event) =>
                          setProductForm({
                            ...productForm,
                            compatibility: event.target.value,
                          })
                        }
                        placeholder="Marque, modèle, année…"
                        value={productForm.compatibility}
                      />
                    </label>
                    <label>
                      Stock (laisser vide si non suivi)
                      <input
                        min={0}
                        onChange={(event) =>
                          setProductForm({
                            ...productForm,
                            stock: event.target.value
                              ? Number(event.target.value)
                              : null,
                          })
                        }
                        type="number"
                        value={productForm.stock ?? ""}
                      />
                    </label>
                    <label>
                      Statut
                      <select
                        onChange={(event) =>
                          setProductForm({
                            ...productForm,
                            status: event.target.value as Product["status"],
                          })
                        }
                        value={productForm.status}
                      >
                        <option value="available">Disponible</option>
                        <option value="out_of_stock">En rupture</option>
                        <option value="hidden">Masqué</option>
                      </select>
                    </label>
                  </div>
                  <label>
                    Description
                    <textarea
                      maxLength={4000}
                      onChange={(event) =>
                        setProductForm({
                          ...productForm,
                          description: event.target.value,
                        })
                      }
                      rows={4}
                      value={productForm.description}
                    />
                  </label>

                  <fieldset className="catalog-variants">
                    <legend>Variantes</legend>
                    {productForm.variants.map((variant, index) => (
                      <div
                        className="catalog-variant-row"
                        key={variant.id ?? index}
                      >
                        <label>
                          Nom / modèle
                          <input
                            maxLength={80}
                            onChange={(event) =>
                              setProductForm({
                                ...productForm,
                                variants: productForm.variants.map(
                                  (item, itemIndex) =>
                                    itemIndex === index
                                      ? { ...item, name: event.target.value }
                                      : item,
                                ),
                              })
                            }
                            required
                            value={variant.name}
                          />
                        </label>
                        <label>
                          Prix (vide = prix du produit)
                          <input
                            min={0}
                            onChange={(event) =>
                              setProductForm({
                                ...productForm,
                                variants: productForm.variants.map(
                                  (item, itemIndex) =>
                                    itemIndex === index
                                      ? {
                                          ...item,
                                          price: event.target.value
                                            ? Number(event.target.value)
                                            : null,
                                        }
                                      : item,
                                ),
                              })
                            }
                            type="number"
                            value={variant.price ?? ""}
                          />
                        </label>
                        <label>
                          Stock (facultatif)
                          <input
                            min={0}
                            onChange={(event) =>
                              setProductForm({
                                ...productForm,
                                variants: productForm.variants.map(
                                  (item, itemIndex) =>
                                    itemIndex === index
                                      ? {
                                          ...item,
                                          stock: event.target.value
                                            ? Number(event.target.value)
                                            : null,
                                        }
                                      : item,
                                ),
                              })
                            }
                            type="number"
                            value={variant.stock ?? ""}
                          />
                        </label>
                        <button
                          aria-label={`Retirer la variante ${variant.name || index + 1}`}
                          className="ui-button ui-button--ghost ui-button--sm"
                          onClick={() =>
                            setProductForm({
                              ...productForm,
                              variants: productForm.variants.filter(
                                (_, itemIndex) => itemIndex !== index,
                              ),
                            })
                          }
                          type="button"
                        >
                          Retirer
                        </button>
                      </div>
                    ))}
                    <button
                      className="ui-button ui-button--secondary ui-button--sm"
                      onClick={() =>
                        setProductForm({
                          ...productForm,
                          variants: [
                            ...productForm.variants,
                            { id: null, name: "", price: null, stock: null },
                          ],
                        })
                      }
                      type="button"
                    >
                      Ajouter une variante
                    </button>
                  </fieldset>

                  <label>
                    Photos (JPG, PNG ou WebP, compression WebP automatique, 5 Mo
                    max par photo)
                    <input
                      accept="image/jpeg,image/png,image/webp"
                      multiple
                      onChange={(event) =>
                        setSelectedImages(Array.from(event.target.files ?? []))
                      }
                      ref={imageInput}
                      type="file"
                    />
                  </label>
                  {productForm.id ? (
                    <ProductImageManager
                      onMove={(imageId, direction) => {
                        const product = products.find(
                          (item) => item.id === productForm.id,
                        );
                        if (product)
                          void moveImage(product, imageId, direction);
                      }}
                      onRemove={(imageId) => {
                        const product = products.find(
                          (item) => item.id === productForm.id,
                        );
                        if (product) void removeImage(product, imageId);
                      }}
                      product={products.find(
                        (item) => item.id === productForm.id,
                      )}
                    />
                  ) : null}
                  <div className="catalog-form-actions">
                    <button
                      className="ui-button ui-button--primary"
                      disabled={busy}
                      type="submit"
                    >
                      {busy
                        ? "Enregistrement…"
                        : productForm.id
                          ? "Enregistrer le produit"
                          : "Ajouter le produit"}
                    </button>
                    {productForm.id ? (
                      <button
                        className="ui-button ui-button--ghost"
                        onClick={() => {
                          setProductForm(emptyProduct);
                          setSelectedImages([]);
                          if (imageInput.current) imageInput.current.value = "";
                        }}
                        type="button"
                      >
                        Annuler
                      </button>
                    ) : null}
                  </div>
                </form>
              </details>
            ) : (
              <div className="catalog-limit-message" role="status">
                <strong>Limite du plan Gratuit atteinte.</strong>
                <p>
                  Tu as déjà {productCount} produits. Mets-en un à la corbeille
                  ou passe à un plan supérieur pour en ajouter.
                </p>
              </div>
            )}
            {products.length ? (
              <ul className="catalog-item-list">
                {products.map((product) => (
                  <li className="catalog-item" key={product.id}>
                    <div className="catalog-item-main">
                      {product.images[0] ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          alt=""
                          height="64"
                          src={product.images[0].url}
                          width="64"
                        />
                      ) : (
                        <div
                          aria-hidden="true"
                          className="catalog-image-placeholder"
                        >
                          Photo
                        </div>
                      )}
                      <div>
                        <h3>
                          {product.name}{" "}
                          {product.is_sample ? (
                            <Badge tone="warning">Exemple</Badge>
                          ) : null}
                        </h3>
                        <p>
                          {formatCfa(product.price)}
                          {product.stock === null
                            ? " · stock non suivi"
                            : ` · stock : ${product.stock}`}
                          {product.sku ? ` · ${product.sku}` : ""}
                        </p>
                        {product.variants.length ? (
                          <small>{product.variants.length} variante(s)</small>
                        ) : null}
                      </div>
                    </div>
                    <div className="catalog-item-actions">
                      <button
                        className="ui-button ui-button--secondary ui-button--sm"
                        onClick={() => {
                          setProductForm({
                            id: product.id,
                            categoryId: product.category_id ?? "",
                            name: product.name,
                            description: product.description ?? "",
                            price: product.price,
                            compareAtPrice: product.compare_at_price,
                            sku: product.sku ?? "",
                            compatibility: product.compatibility ?? "",
                            stock: product.stock,
                            status: product.status,
                            variants: product.variants,
                          });
                          window.scrollTo({ top: 0, behavior: "smooth" });
                        }}
                        type="button"
                      >
                        Modifier
                      </button>
                      <button
                        className="ui-button ui-button--ghost ui-button--sm"
                        onClick={() =>
                          void archiveItem("product", product.id, true)
                        }
                        type="button"
                      >
                        Corbeille
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="catalog-muted">
                {initialQuery
                  ? "Aucun produit ne correspond à cette recherche."
                  : "Aucun produit pour le moment."}
              </p>
            )}
          </section>

          <section className="catalog-section">
            <h2>Services</h2>
            <details className="catalog-editor" open={Boolean(serviceForm.id)}>
              <summary>
                {serviceForm.id ? "Modifier le service" : "Ajouter un service"}
              </summary>
              <form className="catalog-form" onSubmit={submitService}>
                <div className="catalog-form-grid">
                  <label>
                    Nom du service
                    <input
                      maxLength={160}
                      onChange={(event) =>
                        setServiceForm({
                          ...serviceForm,
                          name: event.target.value,
                        })
                      }
                      required
                      value={serviceForm.name}
                    />
                  </label>
                  <label>
                    Durée (minutes)
                    <input
                      max={480}
                      min={5}
                      onChange={(event) =>
                        setServiceForm({
                          ...serviceForm,
                          durationMin: Number(event.target.value),
                        })
                      }
                      required
                      type="number"
                      value={serviceForm.durationMin}
                    />
                  </label>
                  <label>
                    Prix (FCFA)
                    <input
                      min={0}
                      onChange={(event) =>
                        setServiceForm({
                          ...serviceForm,
                          price: Number(event.target.value),
                        })
                      }
                      required
                      type="number"
                      value={serviceForm.price}
                    />
                  </label>
                  <label>
                    Acompte (FCFA)
                    <input
                      min={0}
                      onChange={(event) =>
                        setServiceForm({
                          ...serviceForm,
                          depositAmount: Number(event.target.value),
                        })
                      }
                      type="number"
                      value={serviceForm.depositAmount}
                    />
                  </label>
                </div>
                <label>
                  Description
                  <textarea
                    maxLength={4000}
                    onChange={(event) =>
                      setServiceForm({
                        ...serviceForm,
                        description: event.target.value,
                      })
                    }
                    rows={3}
                    value={serviceForm.description}
                  />
                </label>
                <label>
                  Photos du service (JPG, PNG ou WebP, compression WebP
                  automatique, 5 Mo max par photo)
                  <input
                    accept="image/jpeg,image/png,image/webp"
                    multiple
                    onChange={(event) =>
                      setSelectedServiceImages(
                        Array.from(event.target.files ?? []),
                      )
                    }
                    ref={serviceImageInput}
                    type="file"
                  />
                </label>
                {serviceForm.id ? (
                  <ProductImageManager
                    label="Photos du service"
                    onMove={(imageId, direction) => {
                      const service = services.find(
                        (item) => item.id === serviceForm.id,
                      );
                      if (service) {
                        void moveServiceImage(service, imageId, direction);
                      }
                    }}
                    onRemove={(imageId) => {
                      const service = services.find(
                        (item) => item.id === serviceForm.id,
                      );
                      if (service) void removeServiceImage(service, imageId);
                    }}
                    product={services.find(
                      (item) => item.id === serviceForm.id,
                    )}
                  />
                ) : null}
                <label className="catalog-check">
                  <input
                    checked={serviceForm.active}
                    onChange={(event) =>
                      setServiceForm({
                        ...serviceForm,
                        active: event.target.checked,
                      })
                    }
                    type="checkbox"
                  />
                  Service visible et réservable
                </label>
                <div className="catalog-form-actions">
                  <button
                    className="ui-button ui-button--primary"
                    disabled={busy}
                    type="submit"
                  >
                    {busy
                      ? "Enregistrement…"
                      : serviceForm.id
                        ? "Enregistrer le service"
                        : "Ajouter le service"}
                  </button>
                  {serviceForm.id ? (
                    <button
                      className="ui-button ui-button--ghost"
                      onClick={() => setServiceForm(emptyService)}
                      type="button"
                    >
                      Annuler
                    </button>
                  ) : null}
                </div>
              </form>
            </details>
            {filteredServices.length ? (
              <ul className="catalog-item-list">
                {filteredServices.map((service) => (
                  <li className="catalog-item" key={service.id}>
                    <div>
                      <h3>
                        {service.name}{" "}
                        {service.is_sample ? (
                          <Badge tone="warning">Exemple</Badge>
                        ) : null}
                      </h3>
                      <p>
                        {formatCfa(service.price)} · {service.duration_min} min
                        {service.deposit_amount
                          ? ` · acompte ${formatCfa(service.deposit_amount)}`
                          : ""}
                        {!service.active ? " · masqué" : ""}
                      </p>
                    </div>
                    <div className="catalog-item-actions">
                      <button
                        className="ui-button ui-button--secondary ui-button--sm"
                        onClick={() => {
                          setServiceForm({
                            id: service.id,
                            name: service.name,
                            description: service.description ?? "",
                            durationMin: service.duration_min,
                            price: service.price,
                            depositAmount: service.deposit_amount,
                            active: service.active,
                          });
                          window.scrollTo({
                            top: document.body.scrollHeight,
                            behavior: "smooth",
                          });
                        }}
                        type="button"
                      >
                        Modifier
                      </button>
                      <button
                        className="ui-button ui-button--ghost ui-button--sm"
                        onClick={() =>
                          void archiveItem("service", service.id, true)
                        }
                        type="button"
                      >
                        Corbeille
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="catalog-muted">Aucun service enregistré.</p>
            )}
          </section>
        </>
      ) : (
        <section className="catalog-section">
          <h2>Corbeille · conservation 30 jours</h2>
          {products.length || services.length ? (
            <ul className="catalog-item-list">
              {products.map((product) => (
                <li className="catalog-item" key={product.id}>
                  <div>
                    <h3>{product.name}</h3>
                    <p>Produit supprimé le {formatDate(product.deleted_at)}</p>
                  </div>
                  <button
                    className="ui-button ui-button--secondary ui-button--sm"
                    onClick={() =>
                      void archiveItem("product", product.id, false)
                    }
                    type="button"
                  >
                    Restaurer
                  </button>
                </li>
              ))}
              {services.map((service) => (
                <li className="catalog-item" key={service.id}>
                  <div>
                    <h3>{service.name}</h3>
                    <p>Service supprimé le {formatDate(service.deleted_at)}</p>
                  </div>
                  <button
                    className="ui-button ui-button--secondary ui-button--sm"
                    onClick={() =>
                      void archiveItem("service", service.id, false)
                    }
                    type="button"
                  >
                    Restaurer
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="catalog-muted">
              Aucun élément supprimé récemment à restaurer.
            </p>
          )}
        </section>
      )}
    </div>
  );
}

function ProductImageManager({
  product,
  label = "Photos",
  onMove,
  onRemove,
}: {
  product: { images: CatalogImage[] } | undefined;
  label?: string;
  onMove: (imageId: string, direction: -1 | 1) => void;
  onRemove: (imageId: string) => void;
}) {
  if (!product?.images.length) return null;
  return (
    <fieldset className="catalog-image-list">
      <legend>{label} enregistrées · réorganise avec les flèches</legend>
      {product.images.map((image, index) => (
        <div className="catalog-image-item" key={image.id}>
          {/* Supabase returns a public URL for the shop-assets bucket. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img alt="" height="56" src={image.url} width="56" />
          <span>Photo {index + 1}</span>
          <button
            aria-label={`Monter la photo ${index + 1}`}
            className="ui-button ui-button--ghost ui-button--sm"
            disabled={index === 0}
            onClick={() => onMove(image.id, -1)}
            type="button"
          >
            ↑
          </button>
          <button
            aria-label={`Descendre la photo ${index + 1}`}
            className="ui-button ui-button--ghost ui-button--sm"
            disabled={index === product.images.length - 1}
            onClick={() => onMove(image.id, 1)}
            type="button"
          >
            ↓
          </button>
          <button
            className="ui-button ui-button--ghost ui-button--sm"
            onClick={() => onRemove(image.id)}
            type="button"
          >
            Retirer
          </button>
        </div>
      ))}
    </fieldset>
  );
}

function formatCfa(amount: number) {
  return `${new Intl.NumberFormat("fr-FR").format(amount)} FCFA`;
}

function formatDate(value: string | null) {
  return value
    ? new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" }).format(
        new Date(value),
      )
    : "date inconnue";
}
