"use client";

import { useSyncExternalStore } from "react";
import { onboardingDraftSchema, type OnboardingDraft } from "./schemas";

export type OnboardingSnapshot = {
  currentStep: number;
  draft: OnboardingDraft;
  serverUpdatedAt: number;
};

const snapshots = new Map<string, OnboardingSnapshot>();
const listeners = new Map<string, Set<() => void>>();

function storageKey(shopId: string) {
  return `shop-onboarding:${shopId}`;
}

function getLocalSnapshot(shopId: string, serverSnapshot: OnboardingSnapshot) {
  const cached = snapshots.get(shopId);

  if (cached?.serverUpdatedAt === serverSnapshot.serverUpdatedAt) {
    return cached;
  }

  let snapshot = serverSnapshot;

  try {
    const stored = localStorage.getItem(storageKey(shopId));

    if (stored) {
      const parsed = JSON.parse(stored) as {
        currentStep?: unknown;
        draft?: unknown;
        serverUpdatedAt?: unknown;
      };
      const parsedDraft = onboardingDraftSchema.safeParse(parsed.draft);

      if (
        parsedDraft.success &&
        typeof parsed.currentStep === "number" &&
        Number.isInteger(parsed.currentStep) &&
        parsed.currentStep >= 1 &&
        parsed.currentStep <= 8 &&
        typeof parsed.serverUpdatedAt === "number" &&
        parsed.serverUpdatedAt >= 0 &&
        parsedDraft.data.updatedAt > serverSnapshot.draft.updatedAt
      ) {
        snapshot = {
          currentStep: parsed.currentStep,
          draft: parsedDraft.data,
          serverUpdatedAt: parsed.serverUpdatedAt,
        };
      }
    }
  } catch {
    snapshot = serverSnapshot;
  }

  snapshots.set(shopId, snapshot);
  return snapshot;
}

function subscribe(shopId: string, listener: () => void) {
  const shopListeners = listeners.get(shopId) ?? new Set();
  shopListeners.add(listener);
  listeners.set(shopId, shopListeners);

  const onStorage = (event: StorageEvent) => {
    if (event.key === storageKey(shopId)) {
      snapshots.delete(shopId);
      listener();
    }
  };
  window.addEventListener("storage", onStorage);

  return () => {
    shopListeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function useOnboardingSnapshot(
  shopId: string,
  serverSnapshot: OnboardingSnapshot,
) {
  return useSyncExternalStore(
    (listener) => subscribe(shopId, listener),
    () => getLocalSnapshot(shopId, serverSnapshot),
    () => serverSnapshot,
  );
}

export function writeOnboardingSnapshot(
  shopId: string,
  snapshot: OnboardingSnapshot,
) {
  localStorage.setItem(storageKey(shopId), JSON.stringify(snapshot));
  snapshots.set(shopId, snapshot);
  listeners.get(shopId)?.forEach((listener) => listener());
}

export function useNetworkStatus() {
  return useSyncExternalStore(
    (listener) => {
      window.addEventListener("online", listener);
      window.addEventListener("offline", listener);

      return () => {
        window.removeEventListener("online", listener);
        window.removeEventListener("offline", listener);
      };
    },
    () => navigator.onLine,
    () => true,
  );
}
