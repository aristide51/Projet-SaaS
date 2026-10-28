(() => {
  const banner = document.getElementById("pwa-offline-banner");
  const message = banner?.querySelector("[data-pwa-offline-message]");
  const defaultMessage =
    "Hors connexion : pages publiques et données déjà chargées consultables en lecture seule. Modifications et paiements désactivés.";

  function updateStatus() {
    const offline = !navigator.onLine;
    if (banner) {
      banner.hidden = !offline;
      if (offline && message) message.textContent = defaultMessage;
    }
    if (!offline && document.getElementById("private-offline-data")) {
      window.location.reload();
    }
  }

  window.addEventListener("online", updateStatus);
  window.addEventListener("offline", updateStatus);
  if (banner) {
    document.addEventListener(
      "submit",
      (event) => {
        const form = event.target;
        if (!(form instanceof HTMLFormElement) || form.method === "get") return;
        if (navigator.onLine) return;

        event.preventDefault();
        if (message) {
          message.textContent =
            "Action indisponible hors connexion. Réessaie quand le réseau revient.";
        }
        document.dispatchEvent(new Event("pwa-offline-write-blocked"));
      },
      true,
    );
  }

  const offlineData = document.getElementById("private-offline-data");
  if (offlineData) {
    document.documentElement.dataset.privateDataScript = "loaded";
    void showPrivateSnapshots(offlineData);
  }
  updateStatus();

  async function showPrivateSnapshots(container) {
    const activeUserId = localStorage.getItem("boutiques-locales-private-user");
    const empty = document.getElementById("private-data-empty");
    const ordersTarget = document.getElementById("private-data-orders");
    const bookingsTarget = document.getElementById("private-data-bookings");
    if (!activeUserId || !/^[0-9a-f-]{36}$/i.test(activeUserId)) return;

    try {
      const database = await openPrivateDatabase();
      const transaction = database.transaction("snapshots", "readonly");
      const store = transaction.objectStore("snapshots");
      const [orders, bookings] = await Promise.all([
        getSnapshot(database, store, `${activeUserId}:orders`),
        getSnapshot(database, store, `${activeUserId}:bookings`),
      ]);
      database.close();

      const validOrders =
        orders?.userId === activeUserId && orders.kind === "orders"
          ? orders.data
          : null;
      const validBookings =
        bookings?.userId === activeUserId && bookings.kind === "bookings"
          ? bookings.data
          : null;
      let rendered = 0;

      if (Array.isArray(validOrders?.orders) && ordersTarget) {
        appendOrders(ordersTarget, validOrders);
        rendered += validOrders.orders.length;
      }
      if (Array.isArray(validBookings) && bookingsTarget) {
        appendBookings(bookingsTarget, validBookings);
        rendered += validBookings.length;
      }

      if (empty) {
        empty.textContent = rendered
          ? "Ces informations sont en lecture seule et peuvent ne plus être à jour."
          : "Aucune commande ou aucun rendez-vous n’a encore été enregistré hors connexion.";
      }
      container.hidden = false;
    } catch {
      if (empty) {
        empty.textContent =
          "Les données enregistrées hors connexion ne sont pas disponibles sur cet appareil.";
      }
      container.hidden = false;
    }
  }

  function openPrivateDatabase() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open("boutiques-locales-private-v2", 1);
      request.onupgradeneeded = () => {
        request.result.createObjectStore("snapshots", { keyPath: "key" });
        request.result.createObjectStore("keys", { keyPath: "key" });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error("Stockage bloqué."));
    });
  }

  async function getSnapshot(database, store, key) {
    const record = await new Promise((resolve, reject) => {
      const request = store.get(key);
      request.onsuccess = () => resolve(request.result ?? null);
      request.onerror = () => reject(request.error);
    });
    if (!record) return null;

    const keyTransaction = database.transaction("keys", "readonly");
    const storedKey = await new Promise((resolve, reject) => {
      const request = keyTransaction.objectStore("keys").get(record.userId);
      request.onsuccess = () => resolve(request.result?.cryptoKey ?? null);
      request.onerror = () => reject(request.error);
    });
    if (!storedKey || !record.iv || !record.ciphertext) return null;

    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: record.iv },
      storedKey,
      record.ciphertext,
    );
    return new Promise((resolve, reject) => {
      try {
        resolve({
          userId: record.userId,
          kind: record.kind,
          data: JSON.parse(new TextDecoder().decode(plaintext)),
        });
      } catch {
        reject(new Error("Les données hors connexion sont illisibles."));
      }
    });
  }

  function appendOrders(target, snapshot) {
    const shops = new Map(
      Array.isArray(snapshot.shops)
        ? snapshot.shops.map((shop) => [shop.id, shop.name])
        : [],
    );
    const section = document.createElement("section");
    section.setAttribute("aria-label", "Commandes enregistrées");
    const heading = document.createElement("h2");
    heading.textContent = "Mes commandes";
    section.append(heading);

    for (const order of snapshot.orders) {
      if (!order || typeof order !== "object") continue;
      const card = document.createElement("article");
      card.className = "private-record";
      const title = document.createElement("h3");
      title.textContent = String(order.code ?? "Commande");
      const shop = document.createElement("p");
      shop.textContent = String(shops.get(order.shop_id) ?? "Boutique");
      const date = document.createElement("p");
      date.textContent = formatDate(order.created_at);
      const status = document.createElement("p");
      status.textContent = `Statut : ${orderStatusLabel(order.status)}`;
      const total = document.createElement("p");
      total.textContent = `Total : ${String(order.total ?? 0)} FCFA`;
      const items = document.createElement("ul");
      if (Array.isArray(order.items)) {
        for (const item of order.items) {
          if (!item || typeof item !== "object") continue;
          const entry = document.createElement("li");
          entry.textContent = `${String(item.name_snapshot ?? "Article")} × ${String(item.quantity ?? 0)}`;
          items.append(entry);
        }
      }
      card.append(title, shop, date, status, total, items);
      section.append(card);
    }
    target.append(section);
  }

  function appendBookings(target, bookings) {
    const section = document.createElement("section");
    section.setAttribute("aria-label", "Rendez-vous enregistrés");
    const heading = document.createElement("h2");
    heading.textContent = "Mes rendez-vous";
    section.append(heading);

    for (const booking of bookings) {
      if (!booking || typeof booking !== "object") continue;
      const card = document.createElement("article");
      card.className = "private-record";
      const title = document.createElement("h3");
      title.textContent = String(booking.serviceName ?? "Rendez-vous");
      const shop = document.createElement("p");
      shop.textContent = String(booking.shopName ?? "Boutique");
      const date = document.createElement("p");
      date.textContent = `${formatDate(booking.startsAt)} – ${formatDate(booking.endsAt)}`;
      const resource = document.createElement("p");
      resource.textContent = String(booking.resourceName ?? "");
      const status = document.createElement("p");
      status.textContent = `Statut : ${bookingStatusLabel(booking.status)}`;
      card.append(title, shop, date, resource, status);
      section.append(card);
    }
    target.append(section);
  }

  function orderStatusLabel(status) {
    const labels = {
      pending_payment: "En attente de paiement",
      payment_declared: "Paiement déclaré",
      paid: "Payée",
      confirmed: "Confirmée",
      preparing: "En préparation",
      ready: "Prête",
      shipped: "Expédiée",
      completed: "Terminée",
      cancelled: "Annulée",
    };
    return labels[status] ?? "Inconnu";
  }

  function bookingStatusLabel(status) {
    const labels = {
      pending: "En attente de confirmation",
      confirmed: "Confirmé",
      cancelled: "Annulé",
      completed: "Terminé",
      no_show: "Absence constatée",
    };
    return labels[status] ?? "Inconnu";
  }

  function formatDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.valueOf())) return "Horaire indisponible";
    return new Intl.DateTimeFormat("fr-FR", {
      timeZone: "Africa/Ouagadougou",
      dateStyle: "full",
      timeStyle: "short",
    }).format(date);
  }
})();
