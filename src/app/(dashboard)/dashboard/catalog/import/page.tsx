import { ImportCsvClient } from "@/features/catalog/import-csv-client";

type CatalogImportPageProps = {
  searchParams: Promise<{ shop?: string }>;
};

export default async function CatalogImportPage({
  searchParams,
}: CatalogImportPageProps) {
  const { shop: shopId } = await searchParams;

  return (
    <main className="catalog-shell">
      <section className="catalog-card">
        <h1>Importer un catalogue CSV</h1>
        <p>
          Importe plusieurs produits d’un coup depuis un fichier CSV. Télécharge
          le modèle, remplis-le, puis envoie-le.
        </p>
        {shopId ? (
          <ImportCsvClient shopId={shopId} />
        ) : (
          <p>Sélectionne une boutique depuis le catalogue pour importer.</p>
        )}
      </section>
    </main>
  );
}
