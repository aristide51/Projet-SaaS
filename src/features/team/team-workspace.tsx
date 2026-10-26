"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  createShopInvitation,
  removeShopStaff,
  resendShopInvitation,
  revokeShopInvitation,
  updateStaffPermissions,
} from "./actions";
import {
  emptyTeamPermissions,
  parseTeamPermissions,
  TEAM_PERMISSIONS,
  type TeamPermissions,
} from "./permissions";

type TeamMember = {
  user_id: string;
  email: string;
  full_name: string | null;
  role: "owner" | "staff";
  permissions: unknown;
};

type ShopInvitation = {
  id: string;
  email: string;
  permissions: unknown;
  status: string;
  created_at: string;
  expires_at: string;
  is_expired: boolean;
};

type ShopOption = { id: string; name: string };

export function TeamWorkspace({
  shopId,
  shops,
  members,
  invitations,
  maxStaff,
}: {
  shopId: string;
  shops: ShopOption[];
  members: TeamMember[];
  invitations: ShopInvitation[];
  maxStaff: number | null;
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [permissions, setPermissions] =
    useState<TeamPermissions>(emptyTeamPermissions);
  const [editedPermissions, setEditedPermissions] = useState<
    Record<string, TeamPermissions>
  >(() =>
    Object.fromEntries(
      members.map((member) => [
        member.user_id,
        parseTeamPermissions(member.permissions),
      ]),
    ),
  );
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function invite() {
    setBusy(true);
    setError("");
    setMessage("");
    const result = await createShopInvitation({
      shopId,
      email,
      permissions,
    });
    setBusy(false);
    if (!result.success) {
      setError(result.message);
      return;
    }
    setEmail("");
    setPermissions(emptyTeamPermissions);
    setMessage(result.message);
    router.refresh();
  }

  async function savePermissions(userId: string) {
    setBusy(true);
    setError("");
    setMessage("");
    const result = await updateStaffPermissions(
      shopId,
      userId,
      editedPermissions[userId],
    );
    setBusy(false);
    if (!result.success) {
      setError(result.message);
      return;
    }
    setMessage(result.message);
    router.refresh();
  }

  async function runAction(
    action: typeof removeShopStaff,
    id: string,
    confirmation?: string,
  ) {
    if (confirmation && !window.confirm(confirmation)) return;
    setBusy(true);
    setError("");
    setMessage("");
    const result = await action({ shopId, id });
    setBusy(false);
    if (!result.success) {
      setError(result.message);
      return;
    }
    setMessage(result.message);
    router.refresh();
  }

  async function resend(invitationId: string) {
    setBusy(true);
    setError("");
    setMessage("");
    const result = await resendShopInvitation({
      shopId,
      id: invitationId,
    });
    setBusy(false);
    if (!result.success) {
      setError(result.message);
      return;
    }
    setMessage(result.message);
    router.refresh();
  }

  function setPermission(
    target: TeamPermissions,
    setTarget: (permissions: TeamPermissions) => void,
    key: keyof TeamPermissions,
    value: boolean,
  ) {
    setTarget({ ...target, [key]: value });
  }

  const staffCount = members.filter((member) => member.role === "staff").length;
  const pendingCount = invitations.filter(
    (invitation) => invitation.status === "pending" && !invitation.is_expired,
  ).length;
  const atLimit = maxStaff !== null && staffCount + pendingCount >= maxStaff;

  return (
    <main className="team-shell">
      <header className="team-header">
        <div>
          <p className="auth-eyebrow">Espace commerçant</p>
          <h1>Équipe et invitations</h1>
          <p>Invite tes employés et choisis leurs accès.</p>
        </div>
        {shops.length > 1 ? (
          <label className="catalog-shop-select">
            <span>Boutique</span>
            <select
              value={shopId}
              onChange={(event) =>
                router.push(
                  `/dashboard/team?shop=${encodeURIComponent(event.target.value)}`,
                )
              }
            >
              {shops.map((shop) => (
                <option key={shop.id} value={shop.id}>
                  {shop.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </header>

      {maxStaff !== null ? (
        <p className="team-seat-count" aria-live="polite">
          {staffCount + pendingCount} / {maxStaff} place(s) employé utilisées
          (invitations en attente incluses)
        </p>
      ) : null}

      {error ? (
        <p className="auth-form__error" role="alert">
          {error}
        </p>
      ) : null}
      {message ? (
        <p className="catalog-message" role="status">
          {message}
        </p>
      ) : null}

      <section className="team-section">
        <h2>Inviter un employé</h2>
        <label>
          Adresse e-mail
          <input
            autoComplete="email"
            disabled={busy || atLimit}
            onChange={(event) => setEmail(event.target.value)}
            required
            type="email"
            value={email}
          />
        </label>
        <PermissionCheckboxes
          disabled={busy || atLimit}
          onChange={(key, value) =>
            setPermission(permissions, setPermissions, key, value)
          }
          permissions={permissions}
        />
        <button
          className="ui-button ui-button--primary"
          disabled={busy || atLimit || !email.trim()}
          onClick={() => void invite()}
          type="button"
        >
          {busy ? "Enregistrement…" : "Envoyer l’invitation"}
        </button>
        {atLimit ? <p>La limite de places de ton plan est atteinte.</p> : null}
      </section>

      <section className="team-section">
        <h2>Membres</h2>
        {members.length ? (
          <ul className="team-list">
            {members.map((member) => {
              const current =
                editedPermissions[member.user_id] ??
                parseTeamPermissions(member.permissions);
              return (
                <li key={member.user_id} className="team-card">
                  <div>
                    <h3>{member.full_name || member.email}</h3>
                    <p>
                      {member.email} ·{" "}
                      {member.role === "owner" ? "Propriétaire" : "Employé"}
                    </p>
                  </div>
                  {member.role === "staff" ? (
                    <>
                      <PermissionCheckboxes
                        disabled={busy}
                        onChange={(key, value) =>
                          setEditedPermissions((previous) => ({
                            ...previous,
                            [member.user_id]: { ...current, [key]: value },
                          }))
                        }
                        permissions={current}
                      />
                      <div className="catalog-form-actions">
                        <button
                          className="ui-button ui-button--secondary ui-button--sm"
                          disabled={busy}
                          onClick={() => void savePermissions(member.user_id)}
                          type="button"
                        >
                          Enregistrer les droits
                        </button>
                        <button
                          className="ui-button ui-button--ghost ui-button--sm"
                          disabled={busy}
                          onClick={() =>
                            void runAction(
                              removeShopStaff,
                              member.user_id,
                              `Retirer ${member.email} de cette boutique ?`,
                            )
                          }
                          type="button"
                        >
                          Retirer l’employé
                        </button>
                      </div>
                    </>
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : (
          <p>Aucun membre pour le moment.</p>
        )}
      </section>

      <section className="team-section">
        <h2>Invitations</h2>
        {invitations.length ? (
          <ul className="team-list">
            {invitations.map((invitation) => {
              const expired = invitation.is_expired;
              const status = expired ? "Expirée" : invitation.status;
              return (
                <li key={invitation.id} className="team-card">
                  <div>
                    <h3>{invitation.email}</h3>
                    <p>
                      {status} · expire le{" "}
                      {new Date(invitation.expires_at).toLocaleDateString(
                        "fr-FR",
                      )}
                    </p>
                  </div>
                  {invitation.status === "pending" ? (
                    <div className="catalog-form-actions">
                      <button
                        className="ui-button ui-button--secondary ui-button--sm"
                        disabled={busy || expired}
                        onClick={() => void resend(invitation.id)}
                        type="button"
                      >
                        Renvoyer
                      </button>
                      {!expired ? (
                        <button
                          className="ui-button ui-button--ghost ui-button--sm"
                          disabled={busy}
                          onClick={() =>
                            void runAction(revokeShopInvitation, invitation.id)
                          }
                          type="button"
                        >
                          Annuler
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : (
          <p>Aucune invitation pour le moment.</p>
        )}
      </section>
    </main>
  );
}

function PermissionCheckboxes({
  permissions,
  disabled,
  onChange,
}: {
  permissions: TeamPermissions;
  disabled: boolean;
  onChange: (key: keyof TeamPermissions, value: boolean) => void;
}) {
  return (
    <fieldset className="team-permissions">
      <legend>Permissions</legend>
      {TEAM_PERMISSIONS.map(({ key, label }) => (
        <label key={key}>
          <input
            checked={permissions[key]}
            disabled={disabled}
            onChange={(event) => onChange(key, event.target.checked)}
            type="checkbox"
          />
          {label}
        </label>
      ))}
    </fieldset>
  );
}
