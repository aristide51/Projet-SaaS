export function parseCatalogCsv(text: string): Record<string, string>[] {
  const csv = text.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let value = "";
  let quoted = false;

  for (let index = 0; index < csv.length; index += 1) {
    const character = csv[index];
    const next = csv[index + 1];

    if (character === '"' && quoted && next === '"') {
      value += '"';
      index += 1;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (character === "," && !quoted) {
      row.push(value);
      value = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && next === "\n") index += 1;
      row.push(value);
      if (row.some((cell) => cell.trim())) rows.push(row);
      row = [];
      value = "";
    } else {
      value += character;
    }
  }

  if (quoted) throw new Error("Le fichier contient un champ CSV non fermé.");
  row.push(value);
  if (row.some((cell) => cell.trim())) rows.push(row);

  const headers = rows.shift()?.map((header) => header.trim()) ?? [];
  if (!headers.length || new Set(headers).size !== headers.length) {
    throw new Error("Les colonnes du fichier CSV sont manquantes ou répétées.");
  }

  return rows.map((cells) =>
    Object.fromEntries(
      headers
        .map((header, index) => [header, cells[index]?.trim() ?? ""])
        .filter(([, cell]) => cell !== ""),
    ),
  );
}
