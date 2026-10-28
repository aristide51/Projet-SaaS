"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import {
  deleteResource,
  deleteService,
  deleteTimeOff,
  saveAvailabilityRules,
  saveResource,
  saveService,
  saveShopSettings,
  saveTimeOff,
} from "./actions";
import type {
  AvailabilityRuleInput,
  ResourceInput,
  ServiceInput,
  ShopSettingsInput,
  TimeOffInput,
} from "./schemas";
import type { Database } from "@/types/database";

type Shop = Pick<Database["public"]["Tables"]["shops"]["Row"], "id" | "name">;
type Resource = Database["public"]["Tables"]["resources"]["Row"];
type AvailabilityRule =
  Database["public"]["Tables"]["availability_rules"]["Row"];
type TimeOff = Database["public"]["Tables"]["time_off"]["Row"];
type Service = Pick<
  Database["public"]["Tables"]["services"]["Row"],
  | "id"
  | "shop_id"
  | "name"
  | "description"
  | "duration_min"
  | "price"
  | "deposit_amount"
  | "active"
>;
type ShopSettings = Pick<
  Database["public"]["Tables"]["shop_settings"]["Row"],
  | "shop_id"
  | "booking_min_notice_hours"
  | "booking_auto_confirm"
  | "booking_cancel_before_hours"
>;
type Result = { success: true } | { success: false; message: string };
type Slot = Pick<
  AvailabilityRule,
  "resource_id" | "weekday" | "start_time" | "end_time"
>;
type Props = {
  shop: Shop;
  shops: Shop[];
  resources: Resource[];
  rules: AvailabilityRule[];
  timeOff: TimeOff[];
  services: Service[];
  settings: ShopSettings;
};

const DAYS = [
  { key: 1, label: "Lundi" },
  { key: 2, label: "Mardi" },
  { key: 3, label: "Mercredi" },
  { key: 4, label: "Jeudi" },
  { key: 5, label: "Vendredi" },
  { key: 6, label: "Samedi" },
  { key: 0, label: "Dimanche" },
];

function toSlot(rule: AvailabilityRule): Slot {
  return {
    resource_id: rule.resource_id,
    weekday: rule.weekday,
    start_time: rule.start_time.slice(0, 5),
    end_time: rule.end_time.slice(0, 5),
  };
}

function showDate(value: string) {
  return new Date(value).toLocaleString("fr-FR", {
    timeZone: "Africa/Ouagadougou",
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function formText(data: FormData, key: string) {
  const value = data.get(key);
  return typeof value === "string" ? value : "";
}

export function BookingsWorkspace({
  shop,
  shops,
  resources,
  rules: initialRules,
  timeOff,
  services,
  settings,
}: Props) {
  const router = useRouter();
  const [rules, setRules] = useState<Slot[]>(initialRules.map(toSlot));
  const [notice, setNotice] = useState<{
    kind: "success" | "error";
    text: string;
  } | null>(null);
  const [pending, setPending] = useState(false);
  const activeResources = resources.filter((resource) => resource.active);

  async function run(
    action: () => Promise<Result | { success: true; id: string }>,
    successText: string,
  ): Promise<boolean> {
    setPending(true);
    setNotice(null);
    try {
      const result = await action();
      if (!result.success) {
        setNotice({ kind: "error", text: result.message });
        return false;
      }
      setNotice({ kind: "success", text: successText });
      router.refresh();
      return true;
    } finally {
      setPending(false);
    }
  }

  function addSlot(weekday: number) {
    setRules((current) => [
      ...current,
      {
        resource_id: activeResources[0]?.id ?? "",
        weekday,
        start_time: "08:00",
        end_time: "17:00",
      },
    ]);
    setNotice(null);
  }

  function removeSlot(weekday: number, index: number) {
    const target = rules
      .map((rule, ruleIndex) => ({ rule, ruleIndex }))
      .filter(({ rule }) => rule.weekday === weekday)[index]?.ruleIndex;
    if (target === undefined) return;
    setRules((current) =>
      current.filter((_, ruleIndex) => ruleIndex !== target),
    );
  }

  function updateSlot(
    weekday: number,
    index: number,
    field: keyof Slot,
    value: string,
  ) {
    const daySlots = rules.filter((rule) => rule.weekday === weekday);
    const selected = daySlots[index];
    if (!selected) return;
    setRules((current) => {
      const ruleIndex = current.indexOf(selected);
      return current.map((slot, currentIndex) =>
        currentIndex === ruleIndex ? { ...slot, [field]: value } : slot,
      );
    });
  }

  function getRulesForSave(): AvailabilityRuleInput[] {
    return rules.map((slot) => ({
      shop_id: shop.id,
      resource_id: slot.resource_id,
      weekday: slot.weekday,
      start_time: slot.start_time,
      end_time: slot.end_time,
    }));
  }

  async function handleSaveRules(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await run(
      () => saveAvailabilityRules(shop.id, getRulesForSave()),
      "Les horaires ont été enregistrés.",
    );
  }

  async function handleSaveResource(
    event: FormEvent<HTMLFormElement>,
    resource?: Resource,
  ) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const input: ResourceInput = {
      shop_id: shop.id,
      ...(resource ? { id: resource.id } : {}),
      name: formText(data, "name"),
      active: resource?.active ?? true,
    };
    await run(
      () => saveResource(shop.id, input),
      resource
        ? "La ressource a été enregistrée."
        : "La ressource a été ajoutée.",
    );
  }

  async function handleSaveService(
    event: FormEvent<HTMLFormElement>,
    service?: Service,
  ) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const input: ServiceInput = {
      shop_id: shop.id,
      ...(service ? { id: service.id } : {}),
      name: formText(data, "name"),
      description: formText(data, "description") || null,
      duration_min: Number(formText(data, "duration_min")),
      price: Number(formText(data, "price")),
      deposit_amount: Number(formText(data, "deposit_amount")),
      active: service ? data.get("active") === "on" : true,
    };
    await run(
      () => saveService(shop.id, input),
      service ? "Le service a été enregistré." : "Le service a été ajouté.",
    );
  }

  async function handleSaveTimeOff(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const startsAt = `${formText(data, "starts_date")}T${formText(data, "starts_time")}:00Z`;
    const endsAt = `${formText(data, "ends_date")}T${formText(data, "ends_time")}:00Z`;
    const resourceId = formText(data, "resource_id");
    const input: TimeOffInput = {
      shop_id: shop.id,
      resource_id: resourceId || null,
      starts_at: startsAt,
      ends_at: endsAt,
      reason: formText(data, "reason") || undefined,
    };
    const succeeded = await run(
      () => saveTimeOff(shop.id, input),
      "La fermeture exceptionnelle a été enregistrée.",
    );
    if (succeeded) form.reset();
  }

  async function handleSaveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const input: ShopSettingsInput = {
      shop_id: shop.id,
      booking_auto_confirm: data.get("booking_auto_confirm") === "on",
      booking_min_notice_hours: Number(
        formText(data, "booking_min_notice_hours"),
      ),
      booking_cancel_before_hours: Number(
        formText(data, "booking_cancel_before_hours"),
      ),
    };
    await run(
      () => saveShopSettings(shop.id, input),
      "Les réglages ont été enregistrés.",
    );
  }

  return (
    <div className="bookings-page">
      <header className="team-section">
        <p className="auth-eyebrow">Espace commerçant</p>
        <h1>Agenda et rendez-vous</h1>
        <p>
          Configure les services, les horaires et les règles de réservation de
          ta boutique.
        </p>
        {shops.length > 1 && (
          <form method="get">
            <label className="ui-label" htmlFor="booking-shop">
              Boutique
            </label>
            <select
              className="ui-input"
              id="booking-shop"
              name="shop"
              defaultValue={shop.id}
              onChange={(event) => event.currentTarget.form?.requestSubmit()}
            >
              {shops.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </form>
        )}
        {notice && (
          <p
            className={`ui-message ui-message--${notice.kind}`}
            role={notice.kind === "error" ? "alert" : "status"}
          >
            {notice.text}
          </p>
        )}
      </header>

      <section className="team-section">
        <h2>Ressources et employés</h2>
        <p>
          Ajoute les personnes ou espaces qui peuvent recevoir un rendez-vous.
        </p>
        <form
          className="bookings-slot"
          onSubmit={(event) => handleSaveResource(event)}
        >
          <label className="ui-label" htmlFor="new-resource-name">
            Nom de la ressource
          </label>
          <input
            className="ui-input"
            id="new-resource-name"
            name="name"
            maxLength={80}
            required
          />
          <button className="ui-button ui-button--primary" disabled={pending}>
            Ajouter une ressource
          </button>
        </form>
        <ul>
          {resources.map((resource) => (
            <li className="bookings-slot" key={resource.id}>
              <form onSubmit={(event) => handleSaveResource(event, resource)}>
                <label className="ui-label" htmlFor={`resource-${resource.id}`}>
                  Nom
                </label>
                <input
                  className="ui-input"
                  defaultValue={resource.name}
                  id={`resource-${resource.id}`}
                  maxLength={80}
                  name="name"
                  required
                />
                <span>{resource.active ? "Active" : "Inactive"}</span>
                <button
                  className="ui-button ui-button--secondary"
                  disabled={pending}
                >
                  Enregistrer
                </button>
              </form>
              {resource.active ? (
                <button
                  className="ui-button ui-button--secondary"
                  disabled={pending}
                  onClick={() =>
                    run(
                      () => deleteResource(shop.id, resource.id),
                      "La ressource a été désactivée.",
                    )
                  }
                  type="button"
                >
                  Désactiver
                </button>
              ) : (
                <button
                  className="ui-button ui-button--secondary"
                  disabled={pending}
                  onClick={() =>
                    run(
                      () =>
                        saveResource(shop.id, {
                          shop_id: shop.id,
                          id: resource.id,
                          name: resource.name,
                          active: true,
                        }),
                      "La ressource a été réactivée.",
                    )
                  }
                  type="button"
                >
                  Réactiver
                </button>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section className="team-section">
        <h2>Horaires hebdomadaires</h2>
        <p>Les horaires sont saisis en heure locale de Ouagadougou (UTC+0).</p>
        {resources.length === 0 ? (
          <p>Ajoute une ressource avant de définir les horaires de l’agenda.</p>
        ) : (
          <form onSubmit={handleSaveRules}>
            {DAYS.map((day) => {
              const dayRules = rules.filter((rule) => rule.weekday === day.key);
              return (
                <fieldset className="bookings-day" key={day.key}>
                  <legend>{day.label}</legend>
                  {dayRules.map((slot, index) => (
                    <div className="bookings-slot" key={`${day.key}-${index}`}>
                      <label className="ui-label">
                        Ressource
                        <select
                          className="ui-input"
                          value={slot.resource_id}
                          onChange={(event) =>
                            updateSlot(
                              day.key,
                              index,
                              "resource_id",
                              event.target.value,
                            )
                          }
                        >
                          <option value="">Choisir une ressource</option>
                          {resources.map((resource) => (
                            <option key={resource.id} value={resource.id}>
                              {resource.name}
                              {resource.active ? "" : " (inactive)"}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="ui-label">
                        De
                        <input
                          className="ui-input"
                          type="time"
                          value={slot.start_time}
                          onChange={(event) =>
                            updateSlot(
                              day.key,
                              index,
                              "start_time",
                              event.target.value,
                            )
                          }
                          required
                        />
                      </label>
                      <label className="ui-label">
                        À
                        <input
                          className="ui-input"
                          type="time"
                          value={slot.end_time}
                          onChange={(event) =>
                            updateSlot(
                              day.key,
                              index,
                              "end_time",
                              event.target.value,
                            )
                          }
                          required
                        />
                      </label>
                      <button
                        className="ui-button ui-button--secondary"
                        onClick={() => removeSlot(day.key, index)}
                        type="button"
                      >
                        Supprimer la plage
                      </button>
                    </div>
                  ))}
                  <button
                    className="ui-button ui-button--secondary"
                    onClick={() => addSlot(day.key)}
                    type="button"
                  >
                    Ajouter une plage
                  </button>
                </fieldset>
              );
            })}
            <button className="ui-button ui-button--primary" disabled={pending}>
              Enregistrer les horaires
            </button>
          </form>
        )}
      </section>

      <section className="team-section">
        <h2>Services</h2>
        <p>Les montants sont exprimés en FCFA, en nombres entiers.</p>
        <form
          className="bookings-slot"
          onSubmit={(event) => handleSaveService(event)}
        >
          <label className="ui-label">
            Nom
            <input className="ui-input" maxLength={100} name="name" required />
          </label>
          <label className="ui-label">
            Description
            <input className="ui-input" maxLength={500} name="description" />
          </label>
          <label className="ui-label">
            Durée (minutes)
            <input
              className="ui-input"
              max={480}
              min={5}
              name="duration_min"
              required
              type="number"
              defaultValue={30}
            />
          </label>
          <label className="ui-label">
            Prix (FCFA)
            <input
              className="ui-input"
              min={0}
              name="price"
              required
              type="number"
            />
          </label>
          <label className="ui-label">
            Acompte (FCFA)
            <input
              className="ui-input"
              min={0}
              name="deposit_amount"
              required
              type="number"
              defaultValue={0}
            />
          </label>
          <button className="ui-button ui-button--primary" disabled={pending}>
            Ajouter un service
          </button>
        </form>
        {services.length === 0 ? (
          <p>Aucun service configuré pour le moment.</p>
        ) : (
          <ul>
            {services.map((service) => (
              <li key={service.id}>
                <form
                  className="bookings-slot"
                  onSubmit={(event) => handleSaveService(event, service)}
                >
                  <label className="ui-label">
                    Nom
                    <input
                      className="ui-input"
                      defaultValue={service.name}
                      maxLength={100}
                      name="name"
                      required
                    />
                  </label>
                  <label className="ui-label">
                    Description
                    <input
                      className="ui-input"
                      defaultValue={service.description ?? ""}
                      maxLength={500}
                      name="description"
                    />
                  </label>
                  <label className="ui-label">
                    Durée (minutes)
                    <input
                      className="ui-input"
                      defaultValue={service.duration_min}
                      max={480}
                      min={5}
                      name="duration_min"
                      required
                      type="number"
                    />
                  </label>
                  <label className="ui-label">
                    Prix (FCFA)
                    <input
                      className="ui-input"
                      defaultValue={service.price}
                      min={0}
                      name="price"
                      required
                      type="number"
                    />
                  </label>
                  <label className="ui-label">
                    Acompte (FCFA)
                    <input
                      className="ui-input"
                      defaultValue={service.deposit_amount}
                      min={0}
                      name="deposit_amount"
                      required
                      type="number"
                    />
                  </label>
                  <label className="ui-label">
                    <input
                      defaultChecked={service.active}
                      name="active"
                      type="checkbox"
                    />{" "}
                    Service actif
                  </label>
                  <button
                    className="ui-button ui-button--secondary"
                    disabled={pending}
                  >
                    Enregistrer le service
                  </button>
                  <button
                    className="ui-button ui-button--secondary"
                    disabled={pending}
                    onClick={(event) => {
                      event.preventDefault();
                      void run(
                        () => deleteService(shop.id, service.id),
                        "Le service a été désactivé.",
                      );
                    }}
                    type="button"
                  >
                    Désactiver
                  </button>
                  <span>{service.active ? "Actif" : "Inactif"}</span>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="team-section">
        <h2>Fermetures exceptionnelles</h2>
        <p>
          Les dates et heures sont interprétées en heure locale de Ouagadougou
          (UTC+0).
        </p>
        <form className="bookings-slot" onSubmit={handleSaveTimeOff}>
          <label className="ui-label">
            Ressource concernée
            <select className="ui-input" name="resource_id" defaultValue="">
              <option value="">Toute la boutique</option>
              {resources.map((resource) => (
                <option key={resource.id} value={resource.id}>
                  {resource.name}
                </option>
              ))}
            </select>
          </label>
          <label className="ui-label">
            Début — date
            <input
              className="ui-input"
              name="starts_date"
              required
              type="date"
            />
          </label>
          <label className="ui-label">
            Début — heure
            <input
              className="ui-input"
              defaultValue="00:00"
              name="starts_time"
              required
              type="time"
            />
          </label>
          <label className="ui-label">
            Fin — date
            <input className="ui-input" name="ends_date" required type="date" />
          </label>
          <label className="ui-label">
            Fin — heure
            <input
              className="ui-input"
              defaultValue="23:59"
              name="ends_time"
              required
              type="time"
            />
          </label>
          <label className="ui-label">
            Motif
            <input className="ui-input" maxLength={200} name="reason" />
          </label>
          <button className="ui-button ui-button--primary" disabled={pending}>
            Ajouter la fermeture
          </button>
        </form>
        {timeOff.length === 0 ? (
          <p>Aucune fermeture exceptionnelle.</p>
        ) : (
          <ul>
            {timeOff.map((closure) => (
              <li key={closure.id}>
                <p>
                  {showDate(closure.starts_at)} — {showDate(closure.ends_at)}
                  {closure.reason ? ` · ${closure.reason}` : ""}
                  {closure.resource_id
                    ? ` · ${resources.find((item) => item.id === closure.resource_id)?.name ?? "Ressource"}`
                    : " · Toute la boutique"}
                </p>
                <button
                  className="ui-button ui-button--secondary"
                  disabled={pending}
                  onClick={() =>
                    run(
                      () => deleteTimeOff(shop.id, closure.id),
                      "La fermeture a été supprimée.",
                    )
                  }
                  type="button"
                >
                  Supprimer
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="team-section">
        <h2>Réglages de réservation</h2>
        <form className="bookings-slot" onSubmit={handleSaveSettings}>
          <label className="ui-label">
            Préavis minimal (heures)
            <input
              className="ui-input"
              defaultValue={settings.booking_min_notice_hours}
              max={720}
              min={0}
              name="booking_min_notice_hours"
              required
              type="number"
            />
          </label>
          <label className="ui-label">
            Délai d’annulation avant le rendez-vous (heures)
            <input
              className="ui-input"
              defaultValue={settings.booking_cancel_before_hours}
              max={720}
              min={0}
              name="booking_cancel_before_hours"
              required
              type="number"
            />
          </label>
          <label className="ui-label">
            <input
              defaultChecked={settings.booking_auto_confirm}
              name="booking_auto_confirm"
              type="checkbox"
            />{" "}
            Confirmer automatiquement les nouvelles réservations
          </label>
          <button className="ui-button ui-button--primary" disabled={pending}>
            Enregistrer les réglages
          </button>
        </form>
      </section>
    </div>
  );
}
