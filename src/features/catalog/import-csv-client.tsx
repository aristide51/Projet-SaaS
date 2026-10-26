"use client";

import { useState, type ChangeEvent } from "react";
import { Badge } from "@/components/ui/primitives";
import { checkCsvImportCapacity, importCsvProducts } from "./import-csv";
import {
  parseCsvRows,
  type CsvRowInput,
  type CsvRowResult,
} from "./import-csv-schema";
import { downloadCsvTemplate } from "./csv-download";
import { parseCatalogCsv } from "./csv-parser";

type ImportCsvClientProps = {
  shopId: string;
};

const MAX_CSV_BYTES = 2 * 1024 * 1024;
const MAX_CSV_ROWS = 500;
const IMPORT_BATCH_SIZE = 50;

export function ImportCsvClient({ shopId }: ImportCsvClientProps) {
  const [file, setFile] = useState<File | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [result, setResult] = useState<{
    validRows: CsvRowInput[];
    invalidRows: Extract<CsvRowResult, { kind: "invalid" }>[];
  } | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [importProgress, setImportProgress] = useState<number | null>(null);

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const selectedFile = event.currentTarget.files?.[0];
    if (!selectedFile) return;
    if (!selectedFile.name.toLowerCase().endsWith(".csv")) {
      setError("Le fichier doit être au format CSV.");
      setFile(null);
      setResult(null);
      return;
    }
    if (selectedFile.size > MAX_CSV_BYTES) {
      setError("Le fichier CSV doit peser 2 Mo maximum.");
      setFile(null);
      setResult(null);
      return;
    }
    setFile(selectedFile);
    setError("");
    setMessage("");
    setResult(null);
  }

  async function previewFile() {
    if (!file) return;
    setError("");
    setMessage("");
    try {
      const rows = parseCatalogCsv(await file.text());
      if (!rows.length) {
        setError("Le fichier CSV ne contient aucune ligne de données.");
        return;
      }
      if (rows.length > MAX_CSV_ROWS) {
        setError(`Le fichier ne peut pas dépasser ${MAX_CSV_ROWS} lignes.`);
        return;
      }
      const validation = parseCsvRows(rows);
      setResult({
        validRows: validation.valid,
        invalidRows: validation.invalid,
      });
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Impossible de lire le fichier CSV.",
      );
    }
  }

  async function importFile() {
    if (!shopId || !result?.validRows.length) return;
    setIsPending(true);
    setError("");
    setMessage("");
    setImportProgress(0);
    let imported = 0;
    try {
      const capacity = await checkCsvImportCapacity(
        shopId,
        result.validRows.length,
      );
      if (!capacity.success) {
        setError(capacity.message);
        return;
      }

      for (
        let offset = 0;
        offset < result.validRows.length;
        offset += IMPORT_BATCH_SIZE
      ) {
        const batch = result.validRows.slice(
          offset,
          offset + IMPORT_BATCH_SIZE,
        );
        const batchResult = await importCsvProducts(shopId, batch);
        if (!batchResult.success) {
          setResult({
            ...result,
            validRows: result.validRows.slice(offset),
          });
          setError(
            imported
              ? `Import interrompu après ${imported} produit(s). ${batchResult.message} Les lots déjà enregistrés sont conservés.`
              : batchResult.message,
          );
          return;
        }
        imported += batchResult.imported;
        setImportProgress(imported);
      }

      setMessage(`${imported} produit(s) importé(s) par lots de 50.`);
      setResult(null);
      setFile(null);
    } catch {
      setError(
        imported
          ? `Import interrompu après ${imported} produit(s). Les lots déjà enregistrés sont conservés.`
          : "L’import a échoué. Réessaie.",
      );
    } finally {
      setIsPending(false);
      setImportProgress(null);
    }
  }

  return (
    <section className="csv-import" aria-labelledby="csv-import-title">
      <h2 id="csv-import-title">Importer un catalogue CSV</h2>
      <div className="csv-actions">
        <button
          className="ui-button ui-button--secondary ui-button--sm"
          onClick={downloadCsvTemplate}
          type="button"
        >
          Télécharger le modèle CSV
        </button>
        <label className="ui-button ui-button--primary ui-button--sm">
          Choisir un fichier CSV
          <input
            accept=".csv,text/csv"
            onChange={handleFileChange}
            type="file"
          />
        </label>
        {file ? (
          <button
            className="ui-button ui-button--secondary ui-button--sm"
            disabled={isPending}
            onClick={() => void previewFile()}
            type="button"
          >
            Aperçu des lignes
          </button>
        ) : null}
      </div>

      {file ? (
        <p>
          Fichier sélectionné : <strong>{file.name}</strong>
        </p>
      ) : null}
      {error ? (
        <p className="csv-error" role="alert">
          {error}
        </p>
      ) : null}
      {message ? (
        <p className="catalog-message" role="status">
          {message}
        </p>
      ) : null}
      {isPending && result ? (
        <p role="status">
          Importation : {importProgress ?? 0}/{result.validRows.length}{" "}
          produit(s).
        </p>
      ) : null}

      {result ? (
        <div className="csv-preview">
          <h3>Résultat de l’analyse</h3>
          <div className="csv-stats">
            <Badge tone="success">
              {result.validRows.length} ligne(s) valide(s)
            </Badge>
            {result.invalidRows.length ? (
              <Badge tone="warning">
                {result.invalidRows.length} ligne(s) à corriger
              </Badge>
            ) : null}
          </div>
          {result.invalidRows.length ? (
            <div className="csv-invalid-table">
              <h4>Lignes à corriger</h4>
              <div className="catalog-csv-table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Ligne</th>
                      <th>Nom</th>
                      <th>Erreurs</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.invalidRows.map((invalid) => (
                      <tr key={`${invalid.rowIndex}-${invalid.row.name}`}>
                        <td>{invalid.rowIndex}</td>
                        <td>{invalid.row.name || "(vide)"}</td>
                        <td>{invalid.errors.join(", ")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
          {result.validRows.length ? (
            <button
              className="ui-button ui-button--primary"
              disabled={isPending}
              onClick={() => void importFile()}
              type="button"
            >
              {isPending ? "Importation…" : "Importer les produits valides"}
            </button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
