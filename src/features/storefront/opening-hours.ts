import type { Json } from "@/types/database";

const DAYS: Record<string, string> = {
  monday: "Lundi",
  tuesday: "Mardi",
  wednesday: "Mercredi",
  thursday: "Jeudi",
  friday: "Vendredi",
  saturday: "Samedi",
  sunday: "Dimanche",
};

const WEEKDAYS: Record<string, string> = {
  Mon: "monday",
  Tue: "tuesday",
  Wed: "wednesday",
  Thu: "thursday",
  Fri: "friday",
  Sat: "saturday",
  Sun: "sunday",
};

type OpeningDay = {
  closed: boolean;
  opensAt: string;
  closesAt: string;
};

function isOpeningDay(value: Json | undefined): value is OpeningDay {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return (
    typeof value.closed === "boolean" &&
    typeof value.opensAt === "string" &&
    typeof value.closesAt === "string"
  );
}

function readDay(hours: Json, key: string) {
  if (typeof hours !== "object" || hours === null || Array.isArray(hours)) {
    return null;
  }
  const value = hours[key];
  return isOpeningDay(value) ? value : null;
}

export function getOpeningStatus(hours: Json, now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Africa/Ouagadougou",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const weekday = parts.find((part) => part.type === "weekday")?.value;
  const hour = parts.find((part) => part.type === "hour")?.value;
  const minute = parts.find((part) => part.type === "minute")?.value;
  const key = weekday ? WEEKDAYS[weekday] : undefined;
  const day = key ? readDay(hours, key) : null;

  if (!day || day.closed || !day.opensAt || !day.closesAt || !hour || !minute) {
    return { isOpen: false, label: "Fermé maintenant" };
  }

  const current = Number(hour) * 60 + Number(minute);
  const opens = timeInMinutes(day.opensAt);
  const closes = timeInMinutes(day.closesAt);
  const isOpen =
    opens !== null && closes !== null && current >= opens && current < closes;

  return { isOpen, label: isOpen ? "Ouvert maintenant" : "Fermé maintenant" };
}

export function getOpeningHoursList(hours: Json) {
  return Object.entries(DAYS).map(([key, label]) => {
    const day = readDay(hours, key);
    return {
      label,
      value:
        !day || day.closed || !day.opensAt || !day.closesAt
          ? "Fermé"
          : `${day.opensAt} – ${day.closesAt}`,
    };
  });
}

function timeInMinutes(value: string) {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}
