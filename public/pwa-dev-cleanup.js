(() => {
  async function cleanDevelopmentCache() {
    const serviceWorkerUrl = new URL("/sw.js", window.location.origin).href;
    const registrations =
      "serviceWorker" in navigator
        ? await navigator.serviceWorker.getRegistrations()
        : [];
    const appRegistrations = registrations.filter((registration) =>
      [registration.active, registration.waiting, registration.installing]
        .filter((worker) => worker !== null)
        .some((worker) => worker.scriptURL === serviceWorkerUrl),
    );

    await Promise.all(
      appRegistrations.map((registration) => registration.unregister()),
    );

    const appCaches = (await caches.keys()).filter((key) =>
      key.startsWith("boutiques-locales-"),
    );
    await Promise.all(appCaches.map((key) => caches.delete(key)));

    if (navigator.serviceWorker?.controller?.scriptURL === serviceWorkerUrl) {
      window.location.reload();
    }
  }

  function showCleanupError() {
    const show = () => {
      const message = document.createElement("p");
      message.setAttribute("role", "status");
      message.textContent =
        "Le cache hors connexion de développement n’a pas pu être nettoyé. Recharge la page.";
      document.body.prepend(message);
    };

    if (document.body) {
      show();
    } else {
      document.addEventListener("DOMContentLoaded", show, { once: true });
    }
  }

  void cleanDevelopmentCache().catch(showCleanupError);
})();
