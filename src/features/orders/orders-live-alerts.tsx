"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const SOUND_STORAGE_KEY = "orders-alert-sound";
const SOUND_PREFERENCE_EVENT = "orders-alert-sound-change";

export function OrdersLiveAlerts({ shopId }: { shopId: string }) {
  const router = useRouter();
  const [newActivity, setNewActivity] = useState(0);
  const [connectionMessage, setConnectionMessage] = useState("");
  const soundEnabled = useSyncExternalStore(
    subscribeToSoundPreference,
    getSoundPreference,
    () => false,
  );

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`shop-orders:${shopId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "orders",
          filter: `shop_id=eq.${shopId}`,
        },
        () => notifyNewActivity(),
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "orders",
          filter: `shop_id=eq.${shopId}`,
        },
        (payload) => {
          const previous = statusFromPayload(payload.old);
          const current = statusFromPayload(payload.new);
          if (
            current.status === "payment_declared" &&
            previous.status !== "payment_declared"
          ) {
            notifyNewActivity();
          }
        },
      )
      .subscribe((status) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          setConnectionMessage(
            "Les alertes en temps réel sont indisponibles. Actualise la page.",
          );
        } else if (status === "SUBSCRIBED") {
          setConnectionMessage("");
        }
      });

    function notifyNewActivity() {
      setNewActivity((count) => count + 1);
      router.refresh();
      if (getSoundPreference()) {
        playAlertTone();
      }
    }

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [router, shopId]);

  function toggleSound(enabled: boolean) {
    window.localStorage.setItem(SOUND_STORAGE_KEY, String(enabled));
    window.dispatchEvent(new Event(SOUND_PREFERENCE_EVENT));
  }

  function refreshOrders() {
    setNewActivity(0);
    router.refresh();
  }

  return (
    <div className="orders-live-alerts">
      <p aria-live="polite" className="orders-live-alerts__status">
        {connectionMessage ||
          (newActivity
            ? `${newActivity} nouvelle${newActivity > 1 ? "s" : ""} activité${newActivity > 1 ? "s" : ""} sur les commandes`
            : "Alertes de commandes actives")}
      </p>
      {newActivity ? (
        <button
          className="ui-button ui-button--secondary"
          onClick={refreshOrders}
          type="button"
        >
          Voir les nouvelles commandes ({newActivity})
        </button>
      ) : null}
      <label className="orders-live-alerts__sound">
        <input
          checked={soundEnabled}
          onChange={(event) => toggleSound(event.target.checked)}
          type="checkbox"
        />
        Son des alertes
      </label>
    </div>
  );
}

function subscribeToSoundPreference(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(SOUND_PREFERENCE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(SOUND_PREFERENCE_EVENT, onChange);
  };
}

function getSoundPreference() {
  try {
    return window.localStorage.getItem(SOUND_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

function statusFromPayload(value: unknown) {
  if (typeof value !== "object" || value === null || !("status" in value)) {
    return {};
  }
  return {
    status: typeof value.status === "string" ? value.status : undefined,
  };
}

function playAlertTone() {
  const AudioContextConstructor =
    window.AudioContext ??
    (window as typeof window & { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!AudioContextConstructor) return;

  const context = new AudioContextConstructor();
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = "sine";
  oscillator.frequency.value = 880;
  gain.gain.setValueAtTime(0.12, context.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.2);
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start();
  oscillator.stop(context.currentTime + 0.2);
  oscillator.addEventListener("ended", () => void context.close(), {
    once: true,
  });
}
