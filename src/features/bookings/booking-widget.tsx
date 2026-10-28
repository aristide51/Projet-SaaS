"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import {
  createCustomerBooking,
  getAvailableBookingSlots,
  type SlotLookupResult,
} from "./customer-actions";

type Service = {
  id: string;
  name: string;
  description: string | null;
  duration_min: number;
  price: number;
  deposit_amount: number;
};

type Resource = {
  id: string;
  name: string;
};

type Shop = {
  id: string;
  slug: string;
  name: string;
};

type Props = {
  shop: Shop;
  services: Service[];
  resources: Resource[];
  initialServiceId: string | null;
};

type Slot = {
  slot_start: string;
  slot_end: string;
};

function ouagadougouDate(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Ouagadougou",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const value = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

function addDays(date: string, days: number) {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function formatPrice(amount: number) {
  return `${new Intl.NumberFormat("fr-FR").format(amount)} FCFA`;
}

function formatSlot(dateTime: string, includeDate = false) {
  return new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Africa/Ouagadougou",
    ...(includeDate
      ? { dateStyle: "medium", timeStyle: "short" }
      : { hour: "2-digit", minute: "2-digit" }),
  }).format(new Date(dateTime));
}

function dateForSlot(dateTime: string) {
  return ouagadougouDate(new Date(dateTime));
}

function formError(error: unknown) {
  if (error instanceof Error) {
    return "La demande n’a pas abouti. Vérifie ta connexion puis réessaie.";
  }
  return "La demande n’a pas abouti. Réessaie dans un instant.";
}

export function BookingWidget({
  shop,
  services,
  resources,
  initialServiceId,
}: Props) {
  const today = ouagadougouDate();
  const [serviceId, setServiceId] = useState(
    services.some((service) => service.id === initialServiceId)
      ? initialServiceId!
      : (services[0]?.id ?? ""),
  );
  const [resourceId, setResourceId] = useState(resources[0]?.id ?? "");
  const [date, setDate] = useState(today);
  const [slotState, setSlotState] = useState<{
    key: string;
    slots: Slot[];
  }>({ key: "", slots: [] });
  const [nearbySlots, setNearbySlots] = useState<Slot[]>([]);
  const [selectedStart, setSelectedStart] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState<{
    kind: "success" | "error";
    text: string;
  } | null>(null);

  const service = services.find((item) => item.id === serviceId);
  const requestKey = `${shop.id}:${serviceId}:${resourceId}:${date}`;
  const slots = slotState.key === requestKey ? slotState.slots : [];
  const loadingSlots =
    Boolean(serviceId && resourceId && date) && slotState.key !== requestKey;

  useEffect(() => {
    if (!serviceId || !resourceId || !date) return;

    let active = true;
    void getAvailableBookingSlots({
      shopId: shop.id,
      serviceId,
      resourceId,
      date,
    })
      .then((result: SlotLookupResult) => {
        if (!active) return;
        if (!result.success) {
          setSlotState({ key: requestKey, slots: [] });
          setNotice({ kind: "error", text: result.message });
          return;
        }
        setSlotState({ key: requestKey, slots: result.slots });
        setNotice(null);
      })
      .catch((error: unknown) => {
        if (!active) return;
        setSlotState({ key: requestKey, slots: [] });
        setNotice({ kind: "error", text: formError(error) });
      });

    return () => {
      active = false;
    };
  }, [date, requestKey, resourceId, serviceId, shop.id]);

  function resetSlotSelection() {
    setSelectedStart("");
    setNotice(null);
    setNearbySlots([]);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedStart) {
      setNotice({
        kind: "error",
        text: "Choisis un créneau avant de confirmer.",
      });
      return;
    }

    setSubmitting(true);
    setNotice(null);
    try {
      const result = await createCustomerBooking({
        shopId: shop.id,
        shopSlug: shop.slug,
        serviceId,
        resourceId,
        date,
        startsAt: selectedStart,
        note,
      });
      if (!result.success) {
        setNotice({ kind: "error", text: result.message });
        setNearbySlots(result.nearbySlots ?? []);
        if (result.code === "slot_taken") setSelectedStart("");
        return;
      }

      setSelectedStart("");
      setNote("");
      setNotice({
        kind: "success",
        text: "Ta demande de rendez-vous a bien été enregistrée.",
      });
    } catch (error) {
      setNotice({ kind: "error", text: formError(error) });
    } finally {
      setSubmitting(false);
    }
  }

  function chooseNearbySlot(slot: Slot) {
    setDate(dateForSlot(slot.slot_start));
    setSelectedStart(slot.slot_start);
    setNearbySlots([]);
    setNotice(null);
  }

  return (
    <section aria-labelledby="booking-form-title" className="customer-booking">
      <div className="customer-booking__intro">
        <p className="auth-eyebrow">Réservation en ligne</p>
        <h1 id="booking-form-title">Prendre rendez-vous chez {shop.name}</h1>
        <p>Choisis un service, une date et un créneau disponible.</p>
      </div>

      {!services.length || !resources.length ? (
        <div className="public-shop-empty">
          <h2>Les réservations ne sont pas disponibles</h2>
          <p>
            La boutique n’a pas encore configuré ses services et son agenda.
          </p>
        </div>
      ) : (
        <form className="customer-booking__form" onSubmit={handleSubmit}>
          <label className="ui-label" htmlFor="booking-service">
            Service
          </label>
          <select
            className="ui-input"
            id="booking-service"
            value={serviceId}
            onChange={(event) => {
              resetSlotSelection();
              setServiceId(event.target.value);
            }}
            required
          >
            {services.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name} · {item.duration_min} min ·{" "}
                {formatPrice(item.price)}
              </option>
            ))}
          </select>

          {service ? (
            <div className="customer-booking__service-info">
              {service.description ? <p>{service.description}</p> : null}
              {service.deposit_amount > 0 ? (
                <p>
                  Acompte indicatif configuré par la boutique :{" "}
                  <strong>{formatPrice(service.deposit_amount)}</strong>. Les
                  modalités de paiement et d’annulation sont à confirmer auprès
                  de la boutique.
                </p>
              ) : null}
            </div>
          ) : null}

          <label className="ui-label" htmlFor="booking-resource">
            Personne ou ressource
          </label>
          <select
            className="ui-input"
            id="booking-resource"
            value={resourceId}
            onChange={(event) => {
              resetSlotSelection();
              setResourceId(event.target.value);
            }}
            required
          >
            {resources.map((resource) => (
              <option key={resource.id} value={resource.id}>
                {resource.name}
              </option>
            ))}
          </select>

          <label className="ui-label" htmlFor="booking-date">
            Date
          </label>
          <input
            className="ui-input customer-booking__date"
            id="booking-date"
            type="date"
            min={today}
            max={addDays(today, 90)}
            value={date}
            onChange={(event) => {
              resetSlotSelection();
              setDate(event.target.value);
            }}
            required
          />
          <p className="customer-booking__hint">
            Les heures sont affichées en heure locale de Ouagadougou.
          </p>

          <fieldset className="customer-booking__slots">
            <legend>Créneaux disponibles</legend>
            {loadingSlots ? (
              <p role="status">Recherche des créneaux…</p>
            ) : slots.length ? (
              <div className="customer-booking__slot-list">
                {slots.map((slot) => (
                  <label
                    className={`customer-booking__slot${selectedStart === slot.slot_start ? "is-selected" : ""}`}
                    key={slot.slot_start}
                  >
                    <input
                      type="radio"
                      name="booking-slot"
                      value={slot.slot_start}
                      checked={selectedStart === slot.slot_start}
                      onChange={() => {
                        setSelectedStart(slot.slot_start);
                        setNotice(null);
                      }}
                    />
                    <span>{formatSlot(slot.slot_start)}</span>
                  </label>
                ))}
              </div>
            ) : (
              <p>
                Aucun créneau disponible à cette date. Essaie un autre jour.
              </p>
            )}
          </fieldset>

          <label className="ui-label" htmlFor="booking-note">
            Note pour la boutique <span>(facultatif)</span>
          </label>
          <textarea
            className="ui-input"
            id="booking-note"
            maxLength={500}
            rows={3}
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />

          {notice ? (
            <p
              className={`ui-message ui-message--${notice.kind}`}
              role={notice.kind === "error" ? "alert" : "status"}
            >
              {notice.text}
              {notice.kind === "error" && notice.text.includes("téléphone") ? (
                <>
                  {" "}
                  <Link href="/account">Mettre à jour mon profil</Link>
                </>
              ) : null}
            </p>
          ) : null}

          {nearbySlots.length ? (
            <div className="customer-booking__nearby" role="group">
              <h2>Créneaux proches encore disponibles</h2>
              <div className="customer-booking__slot-list">
                {nearbySlots.map((slot) => (
                  <button
                    className="ui-button ui-button--secondary"
                    key={slot.slot_start}
                    onClick={() => chooseNearbySlot(slot)}
                    type="button"
                  >
                    {formatSlot(slot.slot_start, true)}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <button
            className="ui-button ui-button--primary"
            disabled={submitting || loadingSlots || !selectedStart}
            type="submit"
          >
            {submitting ? "Confirmation…" : "Confirmer le rendez-vous"}
          </button>
        </form>
      )}
    </section>
  );
}
