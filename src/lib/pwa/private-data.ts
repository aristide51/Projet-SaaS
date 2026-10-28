"use client";

const DATABASE_NAME = "boutiques-locales-private-v2";
const DATABASE_VERSION = 1;
const STORE_NAME = "snapshots";
const KEY_STORE_NAME = "keys";
const ACTIVE_USER_KEY = "boutiques-locales-private-user";

export type PrivateSnapshotKind = "orders" | "bookings";

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE_NAME, { keyPath: "key" });
      request.result.createObjectStore(KEY_STORE_NAME, { keyPath: "key" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () =>
      reject(new Error("Le stockage hors ligne est bloqué."));
  });
}

function waitForTransaction(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

async function getEncryptionKey(
  database: IDBDatabase,
  userId: string,
): Promise<CryptoKey> {
  const read = database.transaction(KEY_STORE_NAME, "readonly");
  const existing = await new Promise<CryptoKey | undefined>(
    (resolve, reject) => {
      const request = read.objectStore(KEY_STORE_NAME).get(userId);
      request.onsuccess = () => resolve(request.result?.cryptoKey);
      request.onerror = () => reject(request.error);
    },
  );
  if (existing) return existing;

  const cryptoKey = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
  const write = database.transaction(KEY_STORE_NAME, "readwrite");
  write.objectStore(KEY_STORE_NAME).add({ key: userId, cryptoKey });
  try {
    await waitForTransaction(write);
    return cryptoKey;
  } catch {
    const retry = database.transaction(KEY_STORE_NAME, "readonly");
    const stored = await new Promise<CryptoKey | undefined>(
      (resolve, reject) => {
        const request = retry.objectStore(KEY_STORE_NAME).get(userId);
        request.onsuccess = () => resolve(request.result?.cryptoKey);
        request.onerror = () => reject(request.error);
      },
    );
    if (stored) return stored;
    throw new Error("La clé de chiffrement hors ligne est indisponible.");
  }
}

export async function savePrivateSnapshot(
  userId: string,
  kind: PrivateSnapshotKind,
  data: unknown,
): Promise<void> {
  const database = await openDatabase();
  try {
    if (localStorage.getItem(ACTIVE_USER_KEY) !== userId) {
      const clear = database.transaction(
        [STORE_NAME, KEY_STORE_NAME],
        "readwrite",
      );
      clear.objectStore(STORE_NAME).clear();
      clear.objectStore(KEY_STORE_NAME).clear();
      await waitForTransaction(clear);
      localStorage.setItem(ACTIVE_USER_KEY, userId);
    }
    const cryptoKey = await getEncryptionKey(database, userId);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      cryptoKey,
      new TextEncoder().encode(JSON.stringify(data)),
    );
    if (localStorage.getItem(ACTIVE_USER_KEY) !== userId) return;
    const save = database.transaction(STORE_NAME, "readwrite");
    const encryptedStore = save.objectStore(STORE_NAME);
    encryptedStore.put({
      key: `${userId}:${kind}`,
      userId,
      kind,
      iv,
      ciphertext,
      savedAt: new Date().toISOString(),
    });
    await waitForTransaction(save);
  } finally {
    database.close();
  }
}

export async function clearPrivateSnapshots(): Promise<void> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(
      [STORE_NAME, KEY_STORE_NAME],
      "readwrite",
    );
    transaction.objectStore(STORE_NAME).clear();
    transaction.objectStore(KEY_STORE_NAME).clear();
    await waitForTransaction(transaction);
    localStorage.removeItem(ACTIVE_USER_KEY);
  } finally {
    database.close();
  }
}
