"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  useActionState,
  useEffect,
  useState,
  useSyncExternalStore,
  useTransition,
} from "react";
import { FormField, Input } from "@/components/ui/primitives";
import { ReauthGate } from "@/features/auth/reauth-gate";
import {
  requestAccountDeletion,
  updateProfile,
  type ProfileActionResult,
} from "./actions";

type ProfileFormProps = {
  fullName: string;
  phone: string;
  avatarUrl: string | null;
  reauthVerified: boolean;
};

export function ProfileForm({
  fullName,
  phone,
  avatarUrl,
  reauthVerified,
}: ProfileFormProps) {
  const router = useRouter();
  const [result, updateProfileAction, isProfilePending] = useActionState(
    updateProfile,
    null,
  );
  const [isPending, startTransition] = useTransition();
  const isHydrated = useSyncExternalStore(
    subscribeToHydration,
    () => true,
    () => false,
  );
  const [deletionResult, setDeletionResult] =
    useState<ProfileActionResult | null>(null);

  useEffect(() => {
    if (result?.success) {
      router.refresh();
    }
  }, [result, router]);

  function handleDeletionRequest() {
    if (
      !window.confirm(
        "Enregistrer une demande de suppression de ton compte ? Cette demande sera traitée par l’équipe de la plateforme.",
      )
    ) {
      return;
    }

    setDeletionResult(null);
    startTransition(async () => {
      setDeletionResult(await requestAccountDeletion());
    });
  }

  return (
    <>
      <form
        className="auth-form"
        action={updateProfileAction}
        aria-label="Modifier mon profil"
      >
        <div className="profile-avatar">
          {avatarUrl ? (
            <Image
              src={avatarUrl}
              alt="Avatar actuel"
              width={88}
              height={88}
              unoptimized
            />
          ) : (
            <span aria-hidden="true">?</span>
          )}
        </div>
        <FormField
          label="Nom complet"
          hint="Ce nom peut être affiché sur tes commandes et réservations."
        >
          <Input
            autoComplete="name"
            defaultValue={fullName}
            maxLength={120}
            minLength={2}
            name="fullName"
            required
          />
        </FormField>
        <FormField
          label="Téléphone"
          hint="Numéro burkinabè : 8 chiffres, avec ou sans indicatif +226."
        >
          <Input
            autoComplete="tel"
            defaultValue={phone}
            inputMode="tel"
            name="phone"
            type="tel"
          />
        </FormField>
        <FormField
          label="Avatar (facultatif)"
          hint="JPG, PNG ou WebP, 2 Mo maximum."
        >
          <Input
            accept="image/jpeg,image/png,image/webp"
            className="profile-avatar__input"
            name="avatar"
            type="file"
          />
        </FormField>
        {avatarUrl ? (
          <label className="profile-clear-avatar">
            <input name="clearAvatar" type="checkbox" value="true" />
            Supprimer mon avatar actuel
          </label>
        ) : null}
        {result ? (
          <p
            className={
              result.success ? "auth-form__success" : "auth-form__error"
            }
            role={result.success ? "status" : "alert"}
          >
            {result.message}
          </p>
        ) : null}
        <button
          className="ui-button ui-button--primary ui-button--lg auth-form__submit"
          disabled={isPending || isProfilePending}
          type="submit"
        >
          {isProfilePending ? "Enregistrement…" : "Enregistrer mon profil"}
        </button>
      </form>
      <section
        aria-labelledby="delete-account-title"
        className="profile-delete"
      >
        <h2 id="delete-account-title">Supprimer mon compte</h2>
        <p>
          Tu peux enregistrer une demande. La suppression sera traitée par
          l’équipe de la plateforme.
        </p>
        {deletionResult ? (
          <p
            className={
              deletionResult.success ? "auth-form__success" : "auth-form__error"
            }
            role={deletionResult.success ? "status" : "alert"}
          >
            {deletionResult.message}
          </p>
        ) : null}
        <ReauthGate isVerified={reauthVerified}>
          <button
            className="ui-button ui-button--danger"
            disabled={
              !isHydrated ||
              isPending ||
              isProfilePending ||
              deletionResult?.success === true
            }
            onClick={handleDeletionRequest}
            type="button"
          >
            Demander la suppression
          </button>
        </ReauthGate>
      </section>
    </>
  );
}

function subscribeToHydration() {
  return () => {};
}
