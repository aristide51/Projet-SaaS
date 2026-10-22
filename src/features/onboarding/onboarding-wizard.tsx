"use client";

import Image from "next/image";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import { FormField, Input } from "@/components/ui/primitives";
import {
  checkShopSlugAvailability,
  removeShopLogo,
  saveOnboardingDraft,
  uploadShopLogo,
} from "./actions";
import {
  loadPendingLogo,
  removePendingLogo,
  savePendingLogo,
} from "./local-assets";
import {
  useNetworkStatus,
  useOnboardingSnapshot,
  writeOnboardingSnapshot,
  type OnboardingSnapshot,
} from "./local-draft";
import {
  addStepMetrics,
  hasCompleteOpeningHours,
  type OnboardingCategory,
  type OnboardingDraft,
  validPhoneSchema,
  validShopSlugSchema,
} from "./schemas";

const LocationPicker = dynamic(
  () => import("./location-picker").then((module) => module.LocationPicker),
  {
    loading: () => (
      <div className="onboarding-map-skeleton">Chargement de la carte…</div>
    ),
    ssr: false,
  },
);

const STEPS = [
  "Type de commerce",
  "Identité",
  "Contact et lieu",
  "Checklist",
  "Produits ou services",
  "Encaissement",
  "Prévisualisation",
  "Publication",
] as const;

const CATEGORY_OPTIONS: {
  value: OnboardingCategory;
  title: string;
  description: string;
}[] = [
  {
    value: "hardware",
    title: "Quincaillerie",
    description: "Matériaux, outils et équipements",
  },
  {
    value: "auto_parts",
    title: "Pièces détachées",
    description: "Pièces et accessoires automobiles",
  },
  {
    value: "garage",
    title: "Garage",
    description: "Réparation et entretien",
  },
  {
    value: "salon",
    title: "Salon",
    description: "Coiffure et soins",
  },
  {
    value: "other",
    title: "Autre commerce",
    description: "Un autre commerce de proximité",
  },
];

const WEEKDAYS = [
  ["monday", "Lundi"],
  ["tuesday", "Mardi"],
  ["wednesday", "Mercredi"],
  ["thursday", "Jeudi"],
  ["friday", "Vendredi"],
  ["saturday", "Samedi"],
  ["sunday", "Dimanche"],
] as const;

type OnboardingWizardProps = {
  shopId: string;
  shopName: string;
  draft: OnboardingDraft;
  currentStep: number;
  serverUpdatedAt: number;
};

type SaveStatus = "saved" | "saving" | "offline" | "error";
type SlugStatus =
  "idle" | "checking" | "available" | "taken" | "invalid" | "error";

export function OnboardingWizard({
  shopId,
  shopName,
  draft: initialDraft,
  currentStep: initialStep,
  serverUpdatedAt,
}: OnboardingWizardProps) {
  const serverSnapshot: OnboardingSnapshot = {
    currentStep: initialStep,
    draft: initialDraft,
    serverUpdatedAt,
  };
  const snapshot = useOnboardingSnapshot(shopId, serverSnapshot);
  const isOnline = useNetworkStatus();
  const [saveStatus, setSaveStatus] = useState<SaveStatus>(
    isOnline ? "saved" : "offline",
  );
  const [saveMessage, setSaveMessage] = useState("");
  const [slugStatus, setSlugStatus] = useState<SlugStatus>("idle");
  const [logoMessage, setLogoMessage] = useState("");
  const [logoUploading, setLogoUploading] = useState(false);
  const [pendingLogo, setPendingLogo] = useState<File | null>(null);
  const [retryUpload, setRetryUpload] = useState(0);
  const [slugIsManual, setSlugIsManual] = useState(false);
  const [slugCheckRetry, setSlugCheckRetry] = useState(0);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const stepStartedAt = useRef(0);
  const uploadInProgress = useRef(false);

  const commitSnapshot = useCallback(
    (change: (previous: OnboardingSnapshot) => OnboardingSnapshot) => {
      const next = change(snapshot);

      try {
        writeOnboardingSnapshot(shopId, next);
        setSaveStatus(isOnline ? "saving" : "offline");
        setSaveMessage("");
      } catch {
        setSaveStatus("error");
        setSaveMessage(
          "Le brouillon local n’a pas pu être sauvegardé. Vérifie l’espace disponible sur cet appareil.",
        );
      }
    },
    [isOnline, shopId, snapshot],
  );

  const updateDraft = useCallback(
    (patch: Partial<OnboardingDraft>) => {
      commitSnapshot((previous) => ({
        ...previous,
        draft: {
          ...previous.draft,
          ...patch,
          updatedAt: Date.now(),
        },
      }));
    },
    [commitSnapshot],
  );

  const recordStepTime = useCallback(
    (step: number, abandoned: boolean) => {
      if (step < 1 || step > 4) {
        return null;
      }

      const elapsedMs = Math.max(0, Date.now() - stepStartedAt.current);
      const next = addStepTime(snapshot, step, elapsedMs, abandoned);
      commitSnapshot(() => next);
      stepStartedAt.current = Date.now();
      return next;
    },
    [commitSnapshot, snapshot],
  );

  useEffect(() => {
    stepStartedAt.current = Date.now();
  }, [snapshot.currentStep]);

  useEffect(() => {
    let closed = false;
    void loadPendingLogo(shopId)
      .then((file) => {
        if (closed || !file) {
          return;
        }
        setPendingLogo(file);
        setPreviewUrl(URL.createObjectURL(file));
      })
      .catch(() => setLogoMessage("Le logo local n’a pas pu être chargé."));

    return () => {
      closed = true;
    };
  }, [shopId]);

  useEffect(() => {
    if (!pendingLogo || !isOnline || uploadInProgress.current) {
      return;
    }

    uploadInProgress.current = true;
    setLogoUploading(true);
    setLogoMessage("Envoi du logo…");
    void uploadShopLogo(shopId, pendingLogo)
      .then(async (result) => {
        if (!result.success || !result.path || !result.publicUrl) {
          setLogoMessage(result.message);
          return;
        }

        await removePendingLogo(shopId);
        updateDraft({ logoPath: result.path });
        setPreviewUrl(result.publicUrl);
        setPendingLogo(null);
        setLogoMessage("Logo enregistré.");
      })
      .catch(() => {
        setLogoMessage("Le logo n’a pas pu être envoyé. Il sera réessayé.");
      })
      .finally(() => {
        uploadInProgress.current = false;
        setLogoUploading(false);
      });
  }, [isOnline, pendingLogo, retryUpload, shopId, updateDraft]);

  useEffect(() => {
    if (!isOnline) {
      return;
    }

    const timer = window.setTimeout(() => {
      setSaveStatus("saving");
      void saveOnboardingDraft(shopId, {
        currentStep: snapshot.currentStep,
        draft: snapshot.draft,
      })
        .then((result) => {
          setSaveStatus(result.success ? "saved" : "error");
          setSaveMessage(result.success ? "" : result.message);
        })
        .catch(() => {
          setSaveStatus("error");
          setSaveMessage(
            "La synchronisation a échoué. Le brouillon reste sur cet appareil.",
          );
        });
    }, 1000);

    return () => window.clearTimeout(timer);
  }, [isOnline, shopId, snapshot]);

  useEffect(() => {
    if (snapshot.currentStep > 4) {
      return;
    }

    let alreadyRecorded = false;
    const onPageHide = () => {
      if (!alreadyRecorded) {
        alreadyRecorded = true;
        const updated = recordStepTime(snapshot.currentStep, true);

        if (updated && navigator.sendBeacon) {
          navigator.sendBeacon(
            "/api/onboarding/draft",
            new Blob(
              [
                JSON.stringify({
                  shopId,
                  snapshot: {
                    currentStep: updated.currentStep,
                    draft: updated.draft,
                  },
                }),
              ],
              { type: "application/json" },
            ),
          );
        }
      }
    };

    window.addEventListener("pagehide", onPageHide);
    return () => window.removeEventListener("pagehide", onPageHide);
  }, [recordStepTime, shopId, snapshot.currentStep]);

  useEffect(() => {
    const value = snapshot.draft.slug;

    if (!value) {
      return;
    }

    let current = true;
    const timer = window.setTimeout(() => {
      if (!isValidSlug(value)) {
        setSlugStatus("invalid");
        return;
      }

      setSlugStatus("checking");
      void checkShopSlugAvailability(value, shopId)
        .then((result) => {
          if (!current) {
            return;
          }
          setSlugStatus(
            result.success
              ? "available"
              : result.message.includes("déjà")
                ? "taken"
                : "error",
          );
        })
        .catch(() => {
          if (current) {
            setSlugStatus("error");
          }
        });
    }, 450);

    return () => {
      current = false;
      window.clearTimeout(timer);
    };
  }, [shopId, slugCheckRetry, snapshot.draft.slug]);

  const activeStep = snapshot.currentStep;
  const visibleSaveStatus: SaveStatus = isOnline ? saveStatus : "offline";
  const completion = Math.round((Math.min(activeStep - 1, 4) / 8) * 100);
  const publicLogoUrl =
    previewUrl ??
    (snapshot.draft.logoPath
      ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/shop-assets/${snapshot.draft.logoPath}`
      : null);
  const supportPhone = process.env.NEXT_PUBLIC_SUPPORT_WHATSAPP?.replace(
    /\D/g,
    "",
  );
  const supportEmail = process.env.NEXT_PUBLIC_SUPPORT_EMAIL;
  const helpStep = Math.min(activeStep, 4);
  const helpMessage = encodeURIComponent(
    `Bonjour, j’ai besoin d’aide pour ma boutique ${shopId}, étape ${helpStep} : ${STEPS[helpStep - 1]}.`,
  );

  function changeStep(step: number) {
    if (step < 1 || step > 4 || step === snapshot.currentStep) {
      return;
    }

    const elapsedMs = Math.max(0, Date.now() - stepStartedAt.current);
    stepStartedAt.current = Date.now();
    commitSnapshot((previous) => {
      const updated = addStepTime(
        previous,
        previous.currentStep,
        elapsedMs,
        false,
      );

      return {
        ...updated,
        currentStep: step,
        draft: { ...updated.draft, updatedAt: Date.now() },
      };
    });
  }

  function nextStep() {
    if (snapshot.currentStep < 4) {
      changeStep(snapshot.currentStep + 1);
      return;
    }

    const elapsedMs = Math.max(0, Date.now() - stepStartedAt.current);
    stepStartedAt.current = Date.now();
    commitSnapshot((previous) => {
      const updated = addStepTime(previous, 4, elapsedMs, false);

      return {
        ...updated,
        currentStep: 5,
        draft: { ...updated.draft, updatedAt: Date.now() },
      };
    });
  }

  function updateCategory(category: OnboardingCategory) {
    updateDraft({ category });
  }

  function updateName(value: string) {
    const patch: Partial<OnboardingDraft> = { name: value };

    if (!slugIsManual) {
      patch.slug = slugify(value) || snapshot.draft.slug;
      setSlugStatus("idle");
    }

    updateDraft(patch);
  }

  function updateOpeningDay(
    day: (typeof WEEKDAYS)[number][0],
    patch: Partial<OnboardingDraft["openingHours"][typeof day]>,
  ) {
    updateDraft({
      openingHours: {
        ...snapshot.draft.openingHours,
        [day]: { ...snapshot.draft.openingHours[day], ...patch },
      },
    });
  }

  async function handleLogo(file: File | undefined) {
    if (!file) {
      return;
    }

    if (
      file.size === 0 ||
      file.size > 5 * 1024 * 1024 ||
      !["image/jpeg", "image/png", "image/webp"].includes(file.type)
    ) {
      setLogoMessage("Choisis une image JPG, PNG ou WebP de 5 Mo maximum.");
      return;
    }

    try {
      await savePendingLogo(shopId, file);
      setPendingLogo(file);
      setPreviewUrl(URL.createObjectURL(file));
      setLogoMessage(
        isOnline ? "Préparation de l’envoi…" : "Logo gardé sur cet appareil.",
      );
    } catch {
      setLogoMessage("Le logo n’a pas pu être conservé sur cet appareil.");
    }
  }

  async function clearLogo() {
    if (logoUploading) {
      return;
    }

    if (snapshot.draft.logoPath) {
      const result = await removeShopLogo(shopId, snapshot.draft.logoPath);

      if (!result.success) {
        setLogoMessage(result.message);
        return;
      }
    }

    updateDraft({ logoPath: null });
    setPendingLogo(null);
    setPreviewUrl(null);
    setLogoMessage("Logo retiré.");

    try {
      await removePendingLogo(shopId);
    } catch {
      setLogoMessage("Logo retiré. Le fichier local n’a pas pu être effacé.");
    }
  }

  function countHelpRequest() {
    const key = String(helpStep);
    const current = snapshot.draft.metrics.steps[key] ?? {
      elapsedMs: 0,
      abandonCount: 0,
      helpCount: 0,
    };
    updateDraft({
      metrics: {
        steps: {
          ...snapshot.draft.metrics.steps,
          [key]: { ...current, helpCount: current.helpCount + 1 },
        },
      },
    });
  }

  const checklist = [
    { label: "Type de commerce choisi", complete: true },
    {
      label: "Nom et adresse de la boutique",
      complete:
        snapshot.draft.name.trim().length >= 2 &&
        validShopSlugSchema.safeParse(snapshot.draft.slug).success,
    },
    {
      label: "Adresse de la boutique et quartier",
      complete:
        snapshot.draft.address.trim().length > 0 &&
        snapshot.draft.district.trim().length > 0,
    },
    {
      label: "WhatsApp du commerce",
      complete: validPhoneSchema.safeParse(snapshot.draft.whatsapp).success,
    },
    {
      label: "Téléphone de contact",
      complete: validPhoneSchema.safeParse(snapshot.draft.phone).success,
    },
    {
      label: "Horaires renseignés",
      complete: hasCompleteOpeningHours(snapshot.draft.openingHours),
    },
    {
      label: "Épingle de localisation",
      complete: snapshot.draft.lat !== null && snapshot.draft.lng !== null,
    },
    {
      label: "Au moins un produit ou service",
      complete: false,
      upcoming: true,
    },
    { label: "Un mode d’encaissement", complete: false, upcoming: true },
  ];

  return (
    <main className="onboarding-shell">
      <section className="onboarding-card" aria-labelledby="onboarding-title">
        <header className="onboarding-header">
          <p className="auth-eyebrow">
            Mise en route · {snapshot.draft.name || shopName}
          </p>
          <h1 id="onboarding-title">Préparons ta boutique</h1>
          <p>Ton brouillon est privé. Tu pourras le reprendre plus tard.</p>
          <div className="onboarding-progress">
            <div className="onboarding-progress__label">
              <span>Progression</span>
              <span>
                {completion}% · {Math.min(activeStep - 1, 4)} sur 8 étapes
              </span>
            </div>
            <progress
              aria-label="Progression de la mise en route"
              max={100}
              value={completion}
            />
          </div>
          <nav
            aria-label="Étapes de mise en route"
            className="onboarding-steps"
          >
            {STEPS.map((label, index) => {
              const step = index + 1;
              const available = step <= 4;

              return (
                <button
                  aria-current={step === activeStep ? "step" : undefined}
                  aria-label={`Étape ${step} : ${label}${available ? "" : " (bientôt disponible)"}`}
                  className={`onboarding-step ${step === activeStep ? "is-active" : ""} ${step < activeStep ? "is-complete" : ""}`}
                  disabled={!available}
                  key={label}
                  onClick={() => changeStep(step)}
                  type="button"
                >
                  <span>{step}</span>
                  <span>{label}</span>
                </button>
              );
            })}
          </nav>
          <p
            className={`onboarding-save-status is-${visibleSaveStatus}`}
            role="status"
            aria-live="polite"
          >
            {visibleSaveStatus === "saved" ? "Enregistré" : null}
            {visibleSaveStatus === "saving" ? "Enregistrement…" : null}
            {visibleSaveStatus === "offline"
              ? "Hors ligne · brouillon gardé sur cet appareil"
              : null}
            {visibleSaveStatus === "error"
              ? saveMessage || "Synchronisation impossible"
              : null}
          </p>
        </header>

        <div className="onboarding-content">
          {activeStep === 1 ? (
            <section aria-labelledby="onboarding-step-title">
              <p className="onboarding-step-kicker">Étape 1 sur 8</p>
              <h2 id="onboarding-step-title">
                Quel est ton type de commerce ?
              </h2>
              <p>On adaptera les exemples et les catégories à ton activité.</p>
              <div className="onboarding-category-grid">
                {CATEGORY_OPTIONS.map((option) => (
                  <button
                    aria-pressed={snapshot.draft.category === option.value}
                    className={`onboarding-category ${snapshot.draft.category === option.value ? "is-selected" : ""}`}
                    key={option.value}
                    onClick={() => updateCategory(option.value)}
                    type="button"
                  >
                    <strong>{option.title}</strong>
                    <span>{option.description}</span>
                  </button>
                ))}
              </div>
              <div className="onboarding-actions">
                <span />
                <button
                  className="ui-button ui-button--primary"
                  onClick={nextStep}
                  type="button"
                >
                  Continuer
                </button>
              </div>
            </section>
          ) : null}

          {activeStep === 2 ? (
            <section aria-labelledby="onboarding-step-title">
              <p className="onboarding-step-kicker">Étape 2 sur 8</p>
              <h2 id="onboarding-step-title">
                Donne une identité à ta boutique
              </h2>
              <div className="onboarding-fields">
                <FormField label="Nom de la boutique" required>
                  <Input
                    maxLength={80}
                    onChange={(event) => updateName(event.target.value)}
                    value={snapshot.draft.name}
                  />
                </FormField>
                <FormField
                  hint={`Lien public : ${snapshot.draft.slug || "nom-de-ta-boutique"}`}
                  label="Adresse de la boutique"
                  required
                >
                  <Input
                    autoCapitalize="none"
                    autoComplete="off"
                    maxLength={40}
                    onChange={(event) => {
                      setSlugIsManual(true);
                      setSlugStatus("idle");
                      updateDraft({
                        slug: slugify(event.target.value),
                      });
                    }}
                    value={snapshot.draft.slug}
                  />
                </FormField>
                <p
                  className={`onboarding-inline-status is-${slugStatus}`}
                  aria-live="polite"
                  role={
                    slugStatus === "taken" ||
                    slugStatus === "invalid" ||
                    slugStatus === "error"
                      ? "alert"
                      : "status"
                  }
                >
                  {slugStatus === "checking"
                    ? "Vérification de la disponibilité…"
                    : null}
                  {slugStatus === "available" ? "Adresse disponible." : null}
                  {slugStatus === "taken"
                    ? "Adresse déjà utilisée. Choisis-en une autre."
                    : null}
                  {slugStatus === "invalid"
                    ? "Utilise une adresse de 3 à 40 caractères, sans espace ni accent."
                    : null}
                  {slugStatus === "error"
                    ? "La disponibilité n’a pas pu être vérifiée."
                    : null}
                </p>
                {slugStatus === "error" ? (
                  <button
                    className="ui-button ui-button--secondary"
                    onClick={() => setSlugCheckRetry((value) => value + 1)}
                    type="button"
                  >
                    Réessayer la vérification
                  </button>
                ) : null}
                <FormField
                  label="Logo (facultatif)"
                  hint="JPG, PNG ou WebP, 5 Mo maximum. Il reste sur cet appareil hors ligne."
                >
                  <Input
                    accept="image/jpeg,image/png,image/webp"
                    onChange={(event) =>
                      void handleLogo(event.target.files?.[0])
                    }
                    type="file"
                  />
                </FormField>
                {publicLogoUrl ? (
                  <div className="onboarding-logo-preview">
                    <Image
                      alt="Aperçu du logo"
                      height={72}
                      src={publicLogoUrl}
                      unoptimized
                      width={72}
                    />
                    <button
                      className="ui-button ui-button--secondary ui-button--sm"
                      disabled={logoUploading}
                      onClick={() => void clearLogo()}
                      type="button"
                    >
                      Retirer le logo
                    </button>
                  </div>
                ) : (
                  <div
                    className="onboarding-avatar-fallback"
                    aria-label={`Avatar généré à partir des initiales de ${snapshot.draft.name}`}
                  >
                    {getInitials(snapshot.draft.name)}
                  </div>
                )}
                {logoMessage ? (
                  <p className="onboarding-inline-status" role="status">
                    {logoMessage}
                  </p>
                ) : null}
                {pendingLogo && isOnline && !logoUploading ? (
                  <button
                    className="ui-button ui-button--secondary"
                    onClick={() => setRetryUpload((value) => value + 1)}
                    type="button"
                  >
                    Réessayer l’envoi du logo
                  </button>
                ) : null}
                <div className="onboarding-color-field">
                  <label className="ui-label" htmlFor="onboarding-brand-color">
                    Couleur de la boutique
                  </label>
                  <div className="onboarding-color-control">
                    <Input
                      aria-label="Choisir une couleur"
                      id="onboarding-brand-color"
                      onChange={(event) =>
                        updateDraft({ brandColor: event.target.value })
                      }
                      type="color"
                      value={snapshot.draft.brandColor}
                    />
                    <Input
                      aria-label="Code hexadécimal de la couleur"
                      maxLength={7}
                      onChange={(event) =>
                        updateDraft({ brandColor: event.target.value })
                      }
                      value={snapshot.draft.brandColor}
                    />
                  </div>
                </div>
              </div>
              <StepActions
                nextDisabled={
                  snapshot.draft.name.trim().length < 2 ||
                  !validShopSlugSchema.safeParse(snapshot.draft.slug).success ||
                  (isOnline && slugStatus !== "available")
                }
                onBack={() => changeStep(1)}
                onNext={nextStep}
              />
            </section>
          ) : null}

          {activeStep === 3 ? (
            <section aria-labelledby="onboarding-step-title">
              <p className="onboarding-step-kicker">Étape 3 sur 8</p>
              <h2 id="onboarding-step-title">
                Comment te joindre et te trouver ?
              </h2>
              <div className="onboarding-fields">
                <FormField
                  label="WhatsApp"
                  hint="Indicatif international accepté, par exemple +226 70 00 00 00."
                >
                  <Input
                    autoComplete="tel"
                    inputMode="tel"
                    onChange={(event) =>
                      updateDraft({
                        whatsapp: event.target.value.replace(/[^\d+]/g, ""),
                      })
                    }
                    type="tel"
                    value={snapshot.draft.whatsapp}
                  />
                </FormField>
                {snapshot.draft.whatsapp ? (
                  <a
                    className="ui-button ui-button--secondary onboarding-test-link"
                    href={`https://wa.me/${snapshot.draft.whatsapp.replace(/\D/g, "")}?text=${encodeURIComponent("Bonjour, je teste le contact WhatsApp de ma boutique.")}`}
                    rel="noreferrer"
                    target="_blank"
                  >
                    Tester le lien WhatsApp
                  </a>
                ) : null}
                <FormField label="Téléphone du commerce">
                  <Input
                    autoComplete="tel"
                    inputMode="tel"
                    onChange={(event) =>
                      updateDraft({
                        phone: event.target.value.replace(/[^\d+]/g, ""),
                      })
                    }
                    type="tel"
                    value={snapshot.draft.phone}
                  />
                </FormField>
                <div className="onboarding-fields onboarding-fields--two">
                  <FormField label="Ville">
                    <Input
                      maxLength={80}
                      onChange={(event) =>
                        updateDraft({ city: event.target.value })
                      }
                      value={snapshot.draft.city}
                    />
                  </FormField>
                  <FormField label="Quartier">
                    <Input
                      maxLength={100}
                      onChange={(event) =>
                        updateDraft({ district: event.target.value })
                      }
                      value={snapshot.draft.district}
                    />
                  </FormField>
                </div>
                <FormField label="Adresse ou repère">
                  <Input
                    maxLength={300}
                    onChange={(event) =>
                      updateDraft({ address: event.target.value })
                    }
                    value={snapshot.draft.address}
                  />
                </FormField>
                <fieldset className="onboarding-hours">
                  <legend>Horaires d’ouverture</legend>
                  {WEEKDAYS.map(([day, label]) => {
                    const hours = snapshot.draft.openingHours[day];

                    return (
                      <div className="onboarding-hours-row" key={day}>
                        <strong>{label}</strong>
                        <label className="onboarding-hours-closed">
                          <input
                            checked={hours.closed}
                            onChange={(event) =>
                              updateOpeningDay(day, {
                                closed: event.target.checked,
                              })
                            }
                            type="checkbox"
                          />
                          Fermé
                        </label>
                        <Input
                          aria-label={`${label}, ouverture`}
                          disabled={hours.closed}
                          onChange={(event) =>
                            updateOpeningDay(day, {
                              opensAt: event.target.value,
                            })
                          }
                          type="time"
                          value={hours.opensAt}
                        />
                        <Input
                          aria-label={`${label}, fermeture`}
                          disabled={hours.closed}
                          onChange={(event) =>
                            updateOpeningDay(day, {
                              closesAt: event.target.value,
                            })
                          }
                          type="time"
                          value={hours.closesAt}
                        />
                      </div>
                    );
                  })}
                </fieldset>
                <div className="onboarding-map-heading">
                  <div>
                    <h3>Épingle sur la carte</h3>
                    <p>
                      Clique sur la carte pour placer le repère de ta boutique.
                    </p>
                  </div>
                  {snapshot.draft.lat !== null &&
                  snapshot.draft.lng !== null ? (
                    <button
                      className="ui-button ui-button--secondary ui-button--sm"
                      onClick={() => updateDraft({ lat: null, lng: null })}
                      type="button"
                    >
                      Effacer l’épingle
                    </button>
                  ) : null}
                </div>
                <LocationPicker
                  latitude={snapshot.draft.lat}
                  longitude={snapshot.draft.lng}
                  onLocationChange={(lat, lng) => updateDraft({ lat, lng })}
                />
                <div className="onboarding-fields onboarding-fields--two">
                  <FormField label="Latitude">
                    <Input
                      inputMode="decimal"
                      onChange={(event) =>
                        updateDraft({
                          lat: parseCoordinate(event.target.value),
                        })
                      }
                      step="any"
                      type="number"
                      value={snapshot.draft.lat ?? ""}
                    />
                  </FormField>
                  <FormField label="Longitude">
                    <Input
                      inputMode="decimal"
                      onChange={(event) =>
                        updateDraft({
                          lng: parseCoordinate(event.target.value),
                        })
                      }
                      step="any"
                      type="number"
                      value={snapshot.draft.lng ?? ""}
                    />
                  </FormField>
                </div>
                <p className="onboarding-coordinates">
                  {snapshot.draft.lat !== null && snapshot.draft.lng !== null
                    ? `${snapshot.draft.lat.toFixed(5)}, ${snapshot.draft.lng.toFixed(5)}`
                    : "Aucune épingle placée"}
                </p>
              </div>
              <StepActions onBack={() => changeStep(2)} onNext={nextStep} />
            </section>
          ) : null}

          {activeStep === 4 ? (
            <section aria-labelledby="onboarding-step-title">
              <p className="onboarding-step-kicker">Étape 4 sur 8</p>
              <h2 id="onboarding-step-title">
                Ce qu’il reste avant la publication
              </h2>
              <p>
                Tu pourras compléter les étapes suivantes après cette première
                partie.
              </p>
              <ul className="onboarding-checklist">
                {checklist.map((item) => (
                  <li
                    className={item.complete ? "is-complete" : "is-missing"}
                    key={item.label}
                  >
                    <span aria-hidden="true">
                      {item.complete ? "✓" : item.upcoming ? "○" : "!"}
                    </span>
                    <span>{item.label}</span>
                    {item.upcoming ? <small>Étape à venir</small> : null}
                  </li>
                ))}
              </ul>
              <StepActions
                backLabel="Retour"
                nextLabel="Enregistrer et terminer cette partie"
                onBack={() => changeStep(3)}
                onNext={nextStep}
              />
            </section>
          ) : null}

          {activeStep > 4 ? (
            <section
              aria-labelledby="onboarding-step-title"
              className="onboarding-next-phase"
            >
              <p className="onboarding-step-kicker">Étape 5 sur 8</p>
              <h2 id="onboarding-step-title">
                Tes premières étapes sont enregistrées
              </h2>
              <p>
                Le brouillon de ta boutique est conservé. Les étapes 5 à 8
                (catalogue, encaissement, prévisualisation et publication)
                seront disponibles dans la suite du parcours.
              </p>
              <button
                className="ui-button ui-button--secondary"
                onClick={() => changeStep(4)}
                type="button"
              >
                Revoir ma checklist
              </button>
            </section>
          ) : null}
        </div>

        <footer className="onboarding-help">
          <strong>Besoin d’aide ?</strong>
          <span>On peut t’aider à chaque étape.</span>
          <div className="onboarding-help__actions">
            {supportPhone ? (
              <a
                className="ui-button ui-button--secondary"
                href={`https://wa.me/${supportPhone}?text=${helpMessage}`}
                onClick={countHelpRequest}
                rel="noreferrer"
                target="_blank"
              >
                Écrire sur WhatsApp
              </a>
            ) : (
              <span>
                Le contact WhatsApp du support sera bientôt disponible.
              </span>
            )}
            {supportEmail ? (
              <a
                className="ui-button ui-button--secondary"
                href={`mailto:${supportEmail}?subject=${encodeURIComponent(`Aide boutique ${shopId} · étape ${helpStep}`)}&body=${helpMessage}`}
                onClick={countHelpRequest}
              >
                Écrire par e-mail
              </a>
            ) : null}
          </div>
        </footer>
      </section>
    </main>
  );
}

function StepActions({
  onBack,
  onNext,
  nextLabel = "Continuer",
  backLabel = "Retour",
  nextDisabled = false,
}: {
  onBack: () => void;
  onNext: () => void;
  nextLabel?: string;
  backLabel?: string;
  nextDisabled?: boolean;
}) {
  return (
    <div className="onboarding-actions">
      <button
        className="ui-button ui-button--secondary"
        onClick={onBack}
        type="button"
      >
        {backLabel}
      </button>
      <button
        className="ui-button ui-button--primary"
        disabled={nextDisabled}
        onClick={onNext}
        type="button"
      >
        {nextLabel}
      </button>
    </div>
  );
}

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40)
    .replace(/-$/, "");
}

function isValidSlug(value: string) {
  return (
    /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/.test(value) &&
    ![
      "www",
      "api",
      "app",
      "admin",
      "dashboard",
      "support",
      "mail",
      "static",
      "cdn",
    ].includes(value)
  );
}

function getInitials(name: string) {
  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0] ?? "")
    .join("")
    .toLocaleUpperCase("fr");

  return initials || "?";
}

function parseCoordinate(value: string) {
  if (!value.trim()) {
    return null;
  }

  const coordinate = Number(value);
  return Number.isFinite(coordinate) ? coordinate : null;
}

function addStepTime(
  snapshot: OnboardingSnapshot,
  step: number,
  elapsedMs: number,
  abandoned: boolean,
): OnboardingSnapshot {
  if (step < 1 || step > 4) {
    return snapshot;
  }

  return {
    ...snapshot,
    draft: {
      ...addStepMetrics(snapshot.draft, step, elapsedMs, abandoned),
      updatedAt: Date.now(),
    },
  };
}
