// ============================================================
// BlockChat Secure Key Storage — Passphrase-protected IndexedDB
// ============================================================
// Fixes: C3 (unencrypted private key), K1 (raw key in IndexedDB),
//        K2 (no auto-lock)
// ============================================================

import {
  wrapKeyWithPassphrase,
  unwrapKeyWithPassphrase,
} from "./keyDerivation.js";
import { arrayBufferToHex } from "./encoding.js";

const DB_NAME = "BlockChatDB";
const DB_VERSION = 2; // Bumped for new schema
const STORE_NAME = "identities";
const KEY_NAME = "blockchat_identity";

// In-memory cache — cleared on lock/timeout
let _cachedPrivateKey = null;
let _cachedPublicKeyHex = null;
let _lockTimer = null;
const AUTO_LOCK_MS = 5 * 60 * 1000; // 5 minutes inactivity

// ---- IndexedDB helpers ----

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
  });
}

// ---- Public API ----

/**
 * Generate a new ECDH P-256 identity keypair.
 *
 * - Private key generated as extractable ONLY for the initial wrap.
 * - After wrapping with passphrase, the extractable copy is discarded.
 * - Stored version in IndexedDB is encrypted.
 *
 * @param {string} passphrase — user-chosen passphrase for key protection
 * @returns {{ publicKeyHex: string }}
 */
export async function generateAndStoreIdentity(passphrase) {
  if (!passphrase || passphrase.length < 4) {
    throw new Error("Passphrase must be at least 4 characters");
  }

  // Generate keypair — extractable so we can wrap the private key
  const keyPair = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true, // extractable — needed for wrapKey(pkcs8)
    ["deriveBits", "deriveKey"]
  );

  // Export public key as hex for sharing
  const rawPub = await crypto.subtle.exportKey("raw", keyPair.publicKey);
  const publicKeyHex = arrayBufferToHex(rawPub);

  // Wrap private key with passphrase (PBKDF2 → AES-GCM wrap)
  const wrapped = await wrapKeyWithPassphrase(keyPair.privateKey, passphrase);

  // Store ONLY the wrapped (encrypted) private key + public key hex
  const db = await openDB();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const req = store.put(
      {
        wrappedKey: wrapped.wrappedKey,
        salt: wrapped.salt,
        iv: wrapped.iv,
        publicKeyHex,
      },
      KEY_NAME
    );
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });

  // Cache the unwrapped key in memory for immediate use
  // Re-import as non-extractable for runtime use
  const privateKey = await unwrapKeyWithPassphrase(
    wrapped.wrappedKey,
    wrapped.salt,
    wrapped.iv,
    passphrase
  );
  _cachedPrivateKey = privateKey;
  _cachedPublicKeyHex = publicKeyHex;
  _resetLockTimer();

  return { publicKeyHex };
}

/**
 * Unlock the stored identity using the passphrase.
 *
 * Unwraps the private key from IndexedDB → memory.
 *
 * @param {string} passphrase
 * @returns {{ publicKeyHex: string }} or throws
 */
export async function unlockIdentity(passphrase) {
  const stored = await getStoredIdentity();
  if (!stored) throw new Error("No identity found — generate one first");

  const privateKey = await unwrapKeyWithPassphrase(
    stored.wrappedKey,
    stored.salt,
    stored.iv,
    passphrase
  );

  _cachedPrivateKey = privateKey;
  _cachedPublicKeyHex = stored.publicKeyHex;
  _resetLockTimer();

  return { publicKeyHex: stored.publicKeyHex };
}

/**
 * Lock the identity — clear private key from memory.
 */
export function lockIdentity() {
  _cachedPrivateKey = null;
  // Keep publicKeyHex — it's not secret
  if (_lockTimer) {
    clearTimeout(_lockTimer);
    _lockTimer = null;
  }
}

/**
 * Reset the auto-lock timer (call on user activity).
 */
export function resetActivityTimer() {
  _resetLockTimer();
}

/**
 * Check if identity is unlocked (private key available).
 */
export function isUnlocked() {
  return _cachedPrivateKey !== null;
}

/**
 * Get the cached private key.
 * Throws if locked.
 */
export function getPrivateKey() {
  if (!_cachedPrivateKey) {
    throw new Error("Identity is locked — unlock with passphrase first");
  }
  _resetLockTimer();
  return _cachedPrivateKey;
}

/**
 * Get the public key hex (available even when locked).
 */
export function getPublicKeyHex() {
  return _cachedPublicKeyHex;
}

/**
 * Check if an identity exists in IndexedDB.
 */
export async function hasStoredIdentity() {
  const stored = await getStoredIdentity();
  return stored !== null;
}

/**
 * Get raw stored identity data from IndexedDB.
 * Returns { wrappedKey, salt, iv, publicKeyHex } or null.
 */
export async function getStoredIdentity() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const req = store.get(KEY_NAME);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Delete stored identity from IndexedDB and clear memory.
 */
export async function deleteIdentity() {
  lockIdentity();
  _cachedPublicKeyHex = null;
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const req = store.delete(KEY_NAME);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

// ---- Internal helpers ----

function _resetLockTimer() {
  if (_lockTimer) clearTimeout(_lockTimer);
  _lockTimer = setTimeout(() => {
    lockIdentity();
    console.info("[BlockChat] Identity auto-locked after inactivity");
  }, AUTO_LOCK_MS);
}
