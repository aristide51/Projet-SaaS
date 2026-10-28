export type SubscriptionReceipt = {
  invoiceNumber: number;
  shopName: string;
  planName: string;
  amount: number;
  status: "open" | "paid" | "void";
  periodStart: string;
  periodEnd: string;
  dueAt: string;
  paidAt: string | null;
};

const cp1252Overrides = new Map<number, number>([
  [0x20ac, 0x80],
  [0x201a, 0x82],
  [0x0192, 0x83],
  [0x201e, 0x84],
  [0x2026, 0x85],
  [0x2020, 0x86],
  [0x2021, 0x87],
  [0x02c6, 0x88],
  [0x2030, 0x89],
  [0x0160, 0x8a],
  [0x2039, 0x8b],
  [0x0152, 0x8c],
  [0x017d, 0x8e],
  [0x2018, 0x91],
  [0x2019, 0x92],
  [0x201c, 0x93],
  [0x201d, 0x94],
  [0x2022, 0x95],
  [0x2013, 0x96],
  [0x2014, 0x97],
  [0x02dc, 0x98],
  [0x2122, 0x99],
  [0x0161, 0x9a],
  [0x203a, 0x9b],
  [0x0153, 0x9c],
  [0x017e, 0x9e],
  [0x0178, 0x9f],
]);

export function buildSubscriptionReceiptPdf(
  receipt: SubscriptionReceipt,
): Uint8Array {
  const isPaid = receipt.status === "paid";
  const title = isPaid ? "Reçu d'abonnement" : "Facture d'abonnement";
  const statusLabel =
    receipt.status === "paid"
      ? "Payée"
      : receipt.status === "void"
        ? "Annulée"
        : "À régler";
  const number = `FAC-${String(receipt.invoiceNumber).padStart(6, "0")}`;
  const issuedAt = formatDate(new Date().toISOString());
  const lines = [
    { text: title, x: 36, y: 555, size: 20, font: "F2" },
    { text: number, x: 36, y: 535, size: 11, font: "F2" },
    { text: `Statut : ${statusLabel}`, x: 263, y: 535, size: 10, font: "F2" },
    { text: "Boutique", x: 36, y: 490, size: 9, font: "F1" },
    { text: clamp(receipt.shopName, 48), x: 36, y: 470, size: 13, font: "F2" },
    { text: "Abonnement", x: 36, y: 435, size: 9, font: "F1" },
    { text: clamp(receipt.planName, 48), x: 36, y: 415, size: 12, font: "F2" },
    { text: "Montant total", x: 36, y: 369, size: 9, font: "F1" },
    {
      text: `${formatAmount(receipt.amount)} FCFA`,
      x: 36,
      y: 338,
      size: 23,
      font: "F2",
    },
    { text: "Période facturée", x: 36, y: 296, size: 9, font: "F1" },
    {
      text: `Du ${formatDate(receipt.periodStart)} au ${formatDate(receipt.periodEnd)}`,
      x: 36,
      y: 276,
      size: 10,
      font: "F1",
    },
    { text: "Émise le", x: 36, y: 233, size: 9, font: "F1" },
    { text: issuedAt, x: 36, y: 215, size: 11, font: "F1" },
    { text: "Échéance", x: 220, y: 233, size: 9, font: "F1" },
    { text: formatDate(receipt.dueAt), x: 220, y: 215, size: 11, font: "F1" },
    ...(isPaid && receipt.paidAt
      ? [
          { text: "Payée le", x: 36, y: 189, size: 9, font: "F1" },
          {
            text: formatDate(receipt.paidAt),
            x: 36,
            y: 171,
            size: 11,
            font: "F1",
          },
        ]
      : []),
  ];

  const content = [
    "q",
    "0.91 0.94 0.97 rg 28 518 364 62 re f",
    "0.12 0.2 0.29 rg",
    "BT",
    ...lines.map(
      ({ text, x, y, size, font }) =>
        `/${font} ${size} Tf 1 0 0 1 ${x} ${y} Tm <${toCp1252Hex(text)}> Tj`,
    ),
    "ET",
    "0.76 0.8 0.84 RG 36 160 m 384 160 l S",
    "0.98 0.95 0.86 rg 28 55 364 92 re f",
    "0.16 0.2 0.25 rg",
    "BT",
    "/F2 10 Tf 1 0 0 1 39 127 Tm <4D656E74696F6E73206CE967616C65733A> Tj",
    "/F1 10 Tf 1 0 0 1 39 108 Tm <E020636F6D706CE974657220617072E8732076616C69646174696F6E> Tj",
    "/F1 10 Tf 1 0 0 1 39 92 Tm <6176656320766F74726520636F6D707461626C652E> Tj",
    "/F1 8 Tf 1 0 0 1 39 72 Tm <446F63756D656E742064652073756976692C206E65207072E96A756765207061732064652073612076616C6575722066697363616C65> Tj",
    "ET",
    "BT /F1 8 Tf 1 0 0 1 36 36 Tm <446F63756D656E742067E96EE972E9206175746F6D6174697175656D656E742E> Tj ET",
    "Q",
  ].join("\n");

  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 420 595] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>",
    `<< /Length ${new TextEncoder().encode(content).length} >>\nstream\n${content}\nendstream`,
  ];
  let document = "%PDF-1.4\n";
  const offsets = [0];
  for (const [index, object] of objects.entries()) {
    offsets.push(document.length);
    document += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }
  const xrefOffset = document.length;
  document += `xref\n0 ${objects.length + 1}\n`;
  document += "0000000000 65535 f \n";
  for (const offset of offsets.slice(1)) {
    document += `${String(offset).padStart(10, "0")} 00000 n \n`;
  }
  document += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return new TextEncoder().encode(document);
}

function toCp1252Hex(value: string) {
  let hex = "";
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0x3f;
    const byte =
      cp1252Overrides.get(codePoint) ??
      (codePoint >= 0x20 && codePoint <= 0xff ? codePoint : 0x3f);
    hex += byte.toString(16).padStart(2, "0");
  }
  return hex.toUpperCase();
}

function clamp(value: string, maximumLength: number) {
  const normalized = value.replace(/[\r\n\t]/g, " ").trim();
  return normalized.length > maximumLength
    ? `${normalized.slice(0, maximumLength - 1)}…`
    : normalized;
}

function formatAmount(amount: number) {
  return new Intl.NumberFormat("fr-FR")
    .format(amount)
    .replace(/[\u00a0\u202f]/g, " ");
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "long",
    timeZone: "Africa/Ouagadougou",
  }).format(new Date(value));
}
