import { describe, expect, it } from "vitest";
import { parseCatalogCsv } from "./csv-parser";
import { parseCsvRows } from "./import-csv-schema";

describe("parseCatalogCsv", () => {
  it("supports quoted commas, escaped quotes, line breaks and a UTF-8 BOM", () => {
    expect(
      parseCatalogCsv(
        '\uFEFFname,description,price\r\n"Clé, plate","Format ""pro""\nacier",2500\r\n',
      ),
    ).toEqual([
      {
        name: "Clé, plate",
        description: 'Format "pro"\nacier',
        price: "2500",
      },
    ]);
  });

  it("rejects unterminated quoted fields and duplicate headers", () => {
    expect(() => parseCatalogCsv('name,price\n"Produit,100')).toThrow(
      "champ CSV non fermé",
    );
    expect(() => parseCatalogCsv("name,name\nA,B")).toThrow(
      "colonnes du fichier CSV",
    );
  });

  it("parses and validates a 500-product CSV without dropping rows", () => {
    const csv = [
      "name,price",
      ...Array.from({ length: 500 }, (_, index) => `Produit ${index + 1},1000`),
    ].join("\n");
    const validation = parseCsvRows(parseCatalogCsv(csv));

    expect(validation.valid).toHaveLength(500);
    expect(validation.invalid).toHaveLength(0);
  });
});
