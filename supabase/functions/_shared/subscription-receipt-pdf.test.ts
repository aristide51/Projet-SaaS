import { buildSubscriptionReceiptPdf } from "./subscription-receipt-pdf.ts";

Deno.test("le reçu PDF présente les informations et accents attendus", () => {
  const pdf = buildSubscriptionReceiptPdf({
    invoiceNumber: 12,
    shopName: "Épicerie du Centre",
    planName: "Pro",
    amount: 7_500,
    status: "paid",
    periodStart: "2026-09-01T00:00:00.000Z",
    periodEnd: "2026-10-01T00:00:00.000Z",
    dueAt: "2026-10-01T00:00:00.000Z",
    paidAt: "2026-09-28T00:00:00.000Z",
  });
  const source = new TextDecoder().decode(pdf);
  const xrefOffset = Number(source.match(/startxref\n(\d+)/)?.[1]);

  if (!source.startsWith("%PDF-1.4\n")) {
    throw new Error("Le document doit être un PDF.");
  }
  if (!source.includes("/MediaBox [0 0 420 595]")) {
    throw new Error(
      "Le PDF doit utiliser un format portrait adapté au mobile.",
    );
  }
  if (!source.includes("5265E77520642761626F6E6E656D656E74")) {
    throw new Error("Le reçu payé doit porter son titre.");
  }
  if (!source.includes("C9706963657269652064752043656E747265")) {
    throw new Error("Les caractères français doivent être préservés.");
  }
  if (!source.includes("37203530302046434641")) {
    throw new Error("Le montant en FCFA doit être visible.");
  }
  if (
    !source.includes("E020636F6D706CE974657220617072E8732076616C69646174696F6E")
  ) {
    throw new Error(
      "L’avertissement sur les mentions légales doit être présent.",
    );
  }
  if (
    !Number.isInteger(xrefOffset) ||
    source.slice(xrefOffset, xrefOffset + 4) !== "xref" ||
    !source.endsWith("%%EOF\n")
  ) {
    throw new Error("La table de références du PDF doit être valide.");
  }
});

Deno.test(
  "une facture non réglée porte le titre facture et n’affiche pas de date de paiement",
  () => {
    const source = new TextDecoder().decode(
      buildSubscriptionReceiptPdf({
        invoiceNumber: 13,
        shopName: "Atelier Kadi",
        planName: "Premium",
        amount: 15_000,
        status: "open",
        periodStart: "2026-09-01T00:00:00.000Z",
        periodEnd: "2026-10-01T00:00:00.000Z",
        dueAt: "2026-10-01T00:00:00.000Z",
        paidAt: null,
      }),
    );

    if (!source.includes("4661637475726520642761626F6E6E656D656E74")) {
      throw new Error("Une facture ouverte doit porter le titre facture.");
    }
    if (source.includes("506179E965206C65")) {
      throw new Error(
        "Une facture ouverte ne doit pas afficher de date payée.",
      );
    }
  },
);
