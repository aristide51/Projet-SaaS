"use client";

import { useEffect, useRef, useState } from "react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

export function PwaStatus({ showInstall = false }: { showInstall?: boolean }) {
  const [isOffline, setIsOffline] = useState(false);
  const [installPrompt, setInstallPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [updateReady, setUpdateReady] = useState(false);
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(
    null,
  );
  const [message, setMessage] = useState("");
  const reloadAfterUpdate = useRef(false);

  useEffect(() => {
    const updateOnlineStatus = () => {
      setIsOffline(!navigator.onLine);
      document.documentElement.dataset.pwaOffline = String(!navigator.onLine);
    };
    const handleInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };
    const handleInstalled = () => {
      setInstallPrompt(null);
      setMessage("Application installée.");
    };
    const handleOfflineWrite = () => {
      setMessage(
        "Action indisponible hors connexion. Réessaie quand le réseau revient.",
      );
    };
    const handleWorkerMessage = (event: MessageEvent) => {
      if (event.data === "CACHE_WRITE_FAILED") {
        setMessage("Le cache hors connexion est plein ou indisponible.");
      }
    };
    const handleOnline = () => {
      document.documentElement.dataset.pwaOffline = "false";
      setIsOffline(false);
    };
    const handleOffline = () => {
      document.documentElement.dataset.pwaOffline = "true";
      setIsOffline(true);
    };

    updateOnlineStatus();
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    window.addEventListener("beforeinstallprompt", handleInstallPrompt);
    window.addEventListener("appinstalled", handleInstalled);
    document.addEventListener("pwa-offline-write-blocked", handleOfflineWrite);
    navigator.serviceWorker?.addEventListener("message", handleWorkerMessage);

    let active = true;
    const onControllerChange = () => {
      if (!reloadAfterUpdate.current) return;
      reloadAfterUpdate.current = false;
      window.location.reload();
    };

    if ("serviceWorker" in navigator) {
      void navigator.serviceWorker
        .register("/sw.js", { scope: "/", updateViaCache: "none" })
        .then(async (result) => {
          if (!active) return;
          if (result.waiting && navigator.serviceWorker.controller) {
            setWaitingWorker(result.waiting);
            setUpdateReady(true);
          }
          result.addEventListener("updatefound", () => {
            const worker = result.installing;
            worker?.addEventListener("statechange", () => {
              if (
                active &&
                worker.state === "installed" &&
                navigator.serviceWorker.controller
              ) {
                setWaitingWorker(worker);
                setUpdateReady(true);
              }
            });
          });
          await result.update();
        })
        .catch(() => {
          if (active) {
            setMessage("Le mode hors connexion n’a pas pu être activé.");
          }
        });

      navigator.serviceWorker.addEventListener(
        "controllerchange",
        onControllerChange,
      );
    }

    return () => {
      active = false;
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("beforeinstallprompt", handleInstallPrompt);
      window.removeEventListener("appinstalled", handleInstalled);
      document.removeEventListener(
        "pwa-offline-write-blocked",
        handleOfflineWrite,
      );
      navigator.serviceWorker?.removeEventListener(
        "controllerchange",
        onControllerChange,
      );
      navigator.serviceWorker?.removeEventListener(
        "message",
        handleWorkerMessage,
      );
    };
  }, []);

  useEffect(() => {
    if (!isOffline) return;

    function preventOfflineWrites(event: Event) {
      const form = event.target;
      if (!(form instanceof HTMLFormElement)) return;
      if (form.method.toLowerCase() === "get") return;
      event.preventDefault();
      document.dispatchEvent(new Event("pwa-offline-write-blocked"));
    }

    document.addEventListener("submit", preventOfflineWrites, true);
    return () =>
      document.removeEventListener("submit", preventOfflineWrites, true);
  }, [isOffline]);

  async function installApplication() {
    if (!installPrompt) return;
    try {
      await installPrompt.prompt();
      const choice = await installPrompt.userChoice;
      setInstallPrompt(null);
      if (choice.outcome === "accepted") {
        setMessage("Installation en cours.");
      }
    } catch {
      setMessage("L’installation n’a pas pu démarrer.");
    }
  }

  function applyUpdate() {
    reloadAfterUpdate.current = true;
    waitingWorker?.postMessage("SKIP_WAITING");
    setUpdateReady(false);
  }

  return (
    <aside aria-live="polite" className="pwa-status">
      <p
        className="pwa-status__offline"
        hidden={!isOffline}
        id="pwa-offline-banner"
        role="status"
        suppressHydrationWarning
      >
        <span data-pwa-offline-message>
          Hors connexion : pages publiques et données déjà chargées consultables
          en lecture seule. Modifications et paiements désactivés.
        </span>
      </p>
      {message ? <p role="status">{message}</p> : null}
      {showInstall && installPrompt ? (
        <button
          className="ui-button ui-button--secondary ui-button--sm"
          onClick={() => void installApplication()}
          type="button"
        >
          Installer l’application
        </button>
      ) : null}
      {updateReady ? (
        <div className="pwa-status__update">
          <span>Une nouvelle version est prête.</span>
          <button
            className="ui-button ui-button--secondary ui-button--sm"
            onClick={applyUpdate}
            type="button"
          >
            Mettre à jour
          </button>
        </div>
      ) : null}
    </aside>
  );
}
