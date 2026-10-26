export type OrderEmailContent = {
  subject: string;
  title: string;
  text: string;
  html: string;
};

export type OrderEmailTransport = (
  message: OrderEmailContent & {
    to: string;
    from: string;
    idempotencyKey: string;
  },
) => Promise<void>;

const statusLabels: Record<string, string> = {
  payment_declared: "paiement déclaré",
  paid: "paiement confirmé",
  pending_payment: "déclaration à corriger ou paiement en attente",
  confirmed: "commande confirmée",
  ready: "commande prête",
  completed: "commande terminée",
  cancelled: "commande annulée",
  refunded: "commande remboursée",
};

export function buildOrderEmail(
  type: string,
  payload: Record<string, unknown>,
  shopName: string,
  unsubscribeUrl: string,
): OrderEmailContent | null {
  const code = typeof payload.code === "string" ? payload.code : "—";
  let title: string;
  let message: string;

  if (type === "order_received") {
    title = "Commande reçue";
    message = `La boutique ${shopName} a bien reçu ta commande ${code}.`;
  } else if (type === "order_status") {
    const status =
      typeof payload.status === "string" ? payload.status : undefined;
    const label = status ? statusLabels[status] : undefined;
    if (!label) return null;
    title =
      status === "payment_declared"
        ? "Paiement déclaré"
        : status === "confirmed"
          ? "Commande confirmée"
          : status === "ready"
            ? "Commande prête"
            : status === "completed"
              ? "Commande terminée"
              : status === "cancelled"
                ? "Commande annulée"
                : titleForStatus(label);
    message = `La commande ${code} de ${shopName} est maintenant : ${label}.`;
  } else {
    return null;
  }

  return {
    subject: `${title} · ${code}`,
    title,
    text: `${message}\n\nCet e-mail concerne une action liée à ta commande. Les e-mails non essentiels peuvent être désactivés : ${unsubscribeUrl}`,
    html: `<main><h1>${escapeHtml(title)}</h1><p>${escapeHtml(message)}</p><p>Code de commande : <strong>${escapeHtml(code)}</strong></p><p><a href="${escapeHtml(unsubscribeUrl)}">Se désinscrire des e-mails non essentiels</a></p></main>`,
  };
}

export async function sendOrderEmail(
  content: OrderEmailContent & {
    to: string;
    from: string;
    idempotencyKey: string;
  },
  transport: OrderEmailTransport,
) {
  await transport(content);
}

function titleForStatus(status: string) {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entities[character] ?? character;
  });
}
