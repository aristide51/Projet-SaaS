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
  } else if (type === "booking_reminder") {
    const appointmentAt =
      typeof payload.appointment_at === "string"
        ? payload.appointment_at
        : undefined;
    const serviceName =
      typeof payload.service_name === "string"
        ? payload.service_name
        : "ton rendez-vous";
    const cancelUrl =
      typeof payload.cancel_url === "string" ? payload.cancel_url : undefined;
    if (!appointmentAt) return null;
    const formattedDate = new Intl.DateTimeFormat("fr-FR", {
      dateStyle: "full",
      timeStyle: "short",
      timeZone: "Africa/Ouagadougou",
    }).format(new Date(appointmentAt));
    title =
      payload.reminder_stage === "24_hours"
        ? "Rappel de rendez-vous demain"
        : "Rappel de rendez-vous dans 2 heures";
    message = `${serviceName} chez ${shopName} : ${formattedDate}.`;
    return {
      subject: `${title} · ${shopName}`,
      title,
      text: `${message}${cancelUrl ? `\n\nPour annuler, confirme ta demande ici : ${cancelUrl}` : "\n\nPour toute modification, contacte la boutique."}\n\nLes e-mails non essentiels peuvent être désactivés : ${unsubscribeUrl}`,
      html: `<main><h1>${escapeHtml(title)}</h1><p>${escapeHtml(message)}</p>${cancelUrl ? `<p><a href="${escapeHtml(cancelUrl)}">Gérer l’annulation du rendez-vous</a></p>` : "<p>Pour toute modification, contacte la boutique.</p>"}<p><a href="${escapeHtml(unsubscribeUrl)}">Se désinscrire des e-mails non essentiels</a></p></main>`,
    };
  } else if (type === "subscription_reminder") {
    const reminderKey = payload.reminder_key;
    const reminder =
      reminderKey === "7_days"
        ? "dans 7 jours"
        : reminderKey === "3_days"
          ? "dans 3 jours"
          : reminderKey === "due"
            ? null
            : undefined;
    if (reminder === undefined) return null;
    title = reminder
      ? `Échéance d’abonnement ${reminder}`
      : "Échéance d’abonnement";
    message = reminder
      ? `L’abonnement de la boutique ${shopName} arrive à échéance ${reminder}. Consulte la page Abonnement de ton tableau de bord pour vérifier les options disponibles.`
      : `L’abonnement de la boutique ${shopName} est arrivé à échéance. Consulte la page Abonnement de ton tableau de bord pour vérifier les options disponibles.`;
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
    subject:
      type === "subscription_reminder"
        ? `${title} · ${shopName}`
        : `${title} · ${code}`,
    title,
    text: `${message}\n\nLes e-mails non essentiels peuvent être désactivés : ${unsubscribeUrl}`,
    html: `<main><h1>${escapeHtml(title)}</h1><p>${escapeHtml(message)}</p>${type === "subscription_reminder" ? "" : `<p>Code de commande : <strong>${escapeHtml(code)}</strong></p>`}<p><a href="${escapeHtml(unsubscribeUrl)}">Se désinscrire des e-mails non essentiels</a></p></main>`,
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
