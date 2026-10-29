"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

type CompatibilityState = "checking" | "ready" | "blocked" | "error";
type CompatibilityResult = Readonly<{
  compatible: boolean;
  reasons: string[];
}>;

type ConnectionInformation = {
  downlink?: number;
  effectiveType?: string;
};

type UserAgentInformation = {
  platform?: string;
};

type NavigatorWithDeviceInformation = Navigator & {
  deviceMemory?: number;
  connection?: ConnectionInformation;
  userAgentData?: UserAgentInformation;
};

const CompatibilityContext = createContext<CompatibilityState>("checking");

export function useDeviceCompatibility() {
  return useContext(CompatibilityContext);
}

function checkDeviceCompatibility(): CompatibilityResult {
  const browser = navigator as NavigatorWithDeviceInformation;
  const userAgent = navigator.userAgent;
  const platform = browser.userAgentData?.platform ?? userAgent;
  const isAndroid = /android/i.test(platform);
  const isAppleMobile = /iPhone|iPad|iPod/i.test(userAgent);
  const reasons: string[] = [];

  if (!isAndroid && !isAppleMobile) {
    return { compatible: true, reasons };
  }

  if (isAndroid) {
    const androidVersion = Number.parseInt(
      userAgent.match(/Android (\d+)/i)?.[1] ?? "",
      10,
    );

    if (androidVersion > 0 && androidVersion < 13) {
      reasons.push("Android 13 ou une version plus récente est requis.");
    }
  }

  if (isAppleMobile) {
    const iosVersion = Number.parseInt(
      userAgent.match(/(?:CPU (?:iPhone )?OS|iPhone OS) (\d+)/i)?.[1] ?? "",
      10,
    );

    if (iosVersion > 0 && iosVersion < 16) {
      reasons.push("iOS 16 ou une version plus récente est requis.");
    }
  }

  if (typeof browser.deviceMemory === "number" && browser.deviceMemory < 4) {
    reasons.push("Un téléphone plus puissant est nécessaire.");
  }

  if (navigator.hardwareConcurrency > 0 && navigator.hardwareConcurrency < 6) {
    reasons.push(
      "Ce téléphone ne dispose pas de la puissance minimale requise.",
    );
  }

  const connection = browser.connection;
  if (connection?.downlink !== undefined && connection.downlink < 10) {
    reasons.push("Une connexion 4G stable ou un Wi-Fi rapide est nécessaire.");
  } else if (
    connection?.effectiveType &&
    ["slow-2g", "2g", "3g"].includes(connection.effectiveType)
  ) {
    reasons.push("La connexion est trop lente pour utiliser Faso Studio.");
  }

  const canvas = document.createElement("canvas");
  const webgl = canvas.getContext("webgl2");
  if (!webgl) {
    reasons.push(
      "Ce navigateur ne prend pas en charge les graphismes 3D requis.",
    );
  } else {
    const loseContext = webgl.getExtension("WEBGL_lose_context");
    loseContext?.loseContext();
  }

  return { compatible: reasons.length === 0, reasons };
}

export function DeviceCompatibilityGate({
  children,
}: Readonly<{ children: ReactNode }>) {
  const [state, setState] = useState<CompatibilityState>("checking");
  const [reasons, setReasons] = useState<string[]>([]);

  useEffect(() => {
    let active = true;

    void Promise.resolve().then(() => {
      if (!active) return;
      try {
        const result = checkDeviceCompatibility();
        setReasons(result.reasons);
        setState(result.compatible ? "ready" : "blocked");
      } catch {
        setState("error");
      }
    });

    return () => {
      active = false;
    };
  }, []);

  const isBlocking = state === "blocked" || state === "error";

  return (
    <CompatibilityContext.Provider value={state}>
      <div aria-hidden={isBlocking} inert={isBlocking}>
        {children}
      </div>
      {isBlocking && (
        <div className="app-compatibility" role="alertdialog" aria-modal="true">
          <section aria-labelledby="app-compatibility-title">
            <p className="app-compatibility__eyebrow">Faso Studio</p>
            <h1 id="app-compatibility-title">
              {state === "blocked"
                ? "Un équipement plus récent est nécessaire"
                : "Impossible de vérifier cet équipement"}
            </h1>
            <p>
              {state === "blocked"
                ? "Faso Studio nécessite un téléphone récent et une connexion 4G stable ou un Wi-Fi rapide."
                : "Vérifiez votre connexion, puis relancez la vérification."}
            </p>
            {state === "blocked" && reasons.length > 0 && (
              <ul>
                {reasons.map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
            )}
            {state === "blocked" && reasons.length === 0 && (
              <p>
                Les informations de cet appareil ne permettent pas de confirmer
                sa compatibilité. Essayez avec un appareil récent et une
                connexion rapide.
              </p>
            )}
            {state === "error" && (
              <button
                className="marketing-button"
                onClick={() => window.location.reload()}
                type="button"
              >
                Réessayer
              </button>
            )}
          </section>
        </div>
      )}
    </CompatibilityContext.Provider>
  );
}
