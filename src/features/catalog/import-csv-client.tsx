"use client";

import { useCallback, useState, type FormEvent } from "react";
import { Button, FormField, Input, Badge } from "@/components/ui/primitives";
import {
  importCsvProducts,
  validateCsvRows,
  buildCsvTemplate,
  type CsvRowResult,
} from "./import-csv";
import { downloadCsvTemplate } from "./csv-download";

function parseCsv(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length === 0) return [];

  const headerLine = lines[0];
  const headers = headerLine.split(",").map((h) => h.trim().replace(/^"|"$/g, ""));

  return lines.slice(1).map((line) => {
    const values = line.split(",");
    const row: Record<string, string> = {};
    headers.forEach((header, index) => {
      let value = values[index]?.trim() ?? "";
      if (value.startsWith('"') && value.endsWith('"')) {
        value = value.slice(1, -1).replace(/""/g, '"');
      }
      row[header] = value;
    });
    return row;
type ImportCsvClientProps = {
  shopId: string;
};

export function ImportCsvClient({ shopId }: ImportCsvClientProps) {
  const [file, setFile] = useState<File | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [result, setResult] = useState<{
    validCount: number;
    invalidCount: number;
    invalidRows: CsvRowResult[];
  } | null>(null);
  const [error, setError] = useState("");

  const handleDownloadTemplate = () => {
    downloadCsvTemplate();
  };

  const handleFileChange = (event: FormEvent<HTMLInputElement>) => {
    const input = event.currentTarget as HTMLInputElement;
    if (!input.files?.[0]) return;
    const selectedFile = input.files[0];
    if (!selectedFile.name.toLowerCase().endsWith(".csv")) {
      setError("Le fichier doit être au format CSV.");
      setFile(null);
      return;
    }
    setFile(selectedFile);
    setError("");
    setResult(null);
  };

  const handleParse = async () => {
    if (!file) return;
    setError("");
    setResult(null);

    try {
      const text = await file.text();
      const rows = parseCsv(text);
      if (rows.length === 0) {
        setError("Le fichier CSV ne contient aucune ligne de données.");
        return;
      }
      const { valid, invalid } = validateCsvRows(rows);
      setResult({
        validCount: valid.length,
        invalidCount: invalid.length,
        invalidRows: invalid,
      });
    } catch {
      setError("Impossible de lire le fichier CSV.");
    }
  };

  const handleImport = async () => {
    if (!result || result.validCount === 0) return;
    setIsPending(true);
    setError("");

    try {
      if (!shopId) {
        setError("Impossible d’identifier la boutique cible.");
        setIsPending(false);
        return;
      }

      // Re-parser le fichier pour obtenir les lignes validées
      if (!file) {
        setIsPending(false);
        return;
      }
      const text = await file.text();
      const rows = parseCsv(text);
      const { valid } = validateCsvRows(rows);

      // Pour l'import par lots, on envoie les lignes valides
      // Le shopId est récupéré depuis l'attribut data de la page
      // Dans une version complète, ce serait passé par props
      const result = await importCsvProducts(shopId, valid);

      if (!result.success) {
        setError(result.message);
        setResult(null);
        setIsPending(false);
        return;
      }

      setResult(null);
      setError("");
  return (
    <div className="csv-import">
      <div className="csv-actions">
        <a
          href="#"
          onClick={(e) => {
            e.preventDefault();
            handleDownloadTemplate();
          }}
          className="ui-button ui-button--secondary ui-button--sm"
        >
          Télécharger le modèle CSV
        </a>
        <label className="ui-button ui-button--primary ui-button--sm">
          Choisir un fichier CSV
          <input
            type="file"
            accept=".csv"
            onChange={handleFileChange}
            style={{ display: "none" }}
          />
        </label>
        {file && (
          <button
            className="ui-button ui-button--secondary ui-button--sm"
            onClick={handleParse}
            disabled={isPending}
          >
            Aperçu des lignes
          </button>
        )}
      </div>

      {error && (
        <p className="csv-error" role="alert">{error}</p>
      )}

      {file && !result && (
        <p>
          Fichier sélectionné : <strong>{file.name}</strong>
        </p>
      )}

      {result && (
        <div className="csv-preview">
          <h3>Résultat de l’analyse</h3>
          <div className="csv-stats">
            <Badge tone="success">
              {result.validCount} ligne(s) valide(s)
            </Badge>
            {result.invalidCount > 0 && (
              <Badge tone="warning">
                {result.invalidCount} ligne(s) invalide(s)
              </Badge>
            )}
          </div>

          {result.invalidRows.length > 0 && (
            <div className="csv-invalid-table">
              <h4>Lignes à corriger</h4>
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
          )}

          {result.validCount > 0 && (
            <button
              className="ui-button ui-button--primary"
              onClick={handleImport}
              disabled={isPending}
            >
              {isPending ? "Importation…" : "Importer les produits valides"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
    } catch {
      setError("L’import a échoué.");
    } finally {
      setIsPending(false);
    }
  };
  });
}