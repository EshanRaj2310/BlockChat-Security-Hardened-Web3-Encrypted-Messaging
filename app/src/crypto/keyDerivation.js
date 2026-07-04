// ============================================================
// BlockChat Key Derivation — HKDF + PBKDF2
// ============================================================
// Fixes: C2 (no HKDF), K1 (unprotected keys)
// ============================================================

import { arrayBufferToBase64, base64ToArrayBuffer } from "./encoding.js";

/**
 * Derive an AES-256-GCM key from ECDH shared secret via HKDF.
 *
 * This replaces the direct deriveKey(ECDH → AES) pattern.
 * HKDF extracts entropy properly and binds context info.
 *
 * @param {CryptoKey} privateKey — our ECDH private key
 * @param {CryptoKey} publicKey  — their ECDH public key
 * @param {string}    context    — domain-separation label (e.g. "blockchat-dm-v1")
 * @param {Uint8Array} [salt]    — optional salt (defaults to empty)
 * @returns {Promise<CryptoKey>} AES-256-GCM key (non-extractable)
 */
export async function deriveAESKeyWithHKDF(privateKey, publicKey, context = "blockchat-dm-v1", salt = new Uint8Array(32)) {
  // Step 1: ECDH → raw shared bits
  const rawBits = await crypto.subtle.deriveBits(
    { name: "ECDH", public: publicKey },
    privateKey,
    256
  );

  // Step 2: Import raw bits as HKDF input keying material
  const hkdfKey = await crypto.subtle.importKey(
    "raw",
    rawBits,
    "HKDF",
    false,
    ["deriveKey"]
  );

  // Step 3: HKDF → AES-256-GCM key
  const info = new TextEncoder().encode(context);
  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt,
      info,
    },
    hkdfKey,
    { name: "AES-GCM", length: 256 },
    false,  // non-extractable
    ["encrypt", "decrypt"]
  );
}

/**
 * Derive a per-message AES key using HKDF with a unique message nonce.
 *
 * This implements a basic ratchet: each message gets a unique key
 * derived from the shared secret + per-message randomness.
 *
 * @param {CryptoKey} privateKey — our ECDH private key
 * @param {CryptoKey} publicKey  — their ECDH public key
 * @param {Uint8Array} messageNonce — 16 bytes of randomness per message
 * @param {string} context — domain separation label
 * @returns {Promise<CryptoKey>}
 */
export async function derivePerMessageKey(privateKey, publicKey, messageNonce, context = "blockchat-msg-v1") {
  // ECDH → raw bits
  const rawBits = await crypto.subtle.deriveBits(
    { name: "ECDH", public: publicKey },
    privateKey,
    256
  );

  // Import as HKDF IKM
  const hkdfKey = await crypto.subtle.importKey(
    "raw",
    rawBits,
    "HKDF",
    false,
    ["deriveKey"]
  );

  // Use messageNonce as salt, context as info
  const info = new TextEncoder().encode(context);
  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: messageNonce,
      info,
    },
    hkdfKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

/**
 * Derive a wrapping key from a user passphrase using PBKDF2.
 *
 * Used to encrypt/decrypt private keys at rest in IndexedDB.
 *
 * @param {string} passphrase
 * @param {Uint8Array} salt — 16+ bytes, stored alongside wrapped key
 * @param {number} iterations — PBKDF2 iterations (default 600000)
 * @returns {Promise<CryptoKey>} AES-256-GCM wrapping key
 */
export async function deriveWrappingKey(passphrase, salt, iterations = 600000) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"]
  );

  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt,
      iterations,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["wrapKey", "unwrapKey"]
  );
}

/**
 * Wrap (encrypt) a CryptoKey using a passphrase-derived key.
 *
 * @param {CryptoKey} keyToWrap — the private key to protect
 * @param {string} passphrase
 * @returns {Promise<{ wrappedKey: string, salt: string, iv: string }>}
 */
export async function wrapKeyWithPassphrase(keyToWrap, passphrase) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const wrappingKey = await deriveWrappingKey(passphrase, salt);

  const wrapped = await crypto.subtle.wrapKey(
    "pkcs8",
    keyToWrap,
    wrappingKey,
    { name: "AES-GCM", iv }
  );

  return {
    wrappedKey: arrayBufferToBase64(wrapped),
    salt: arrayBufferToBase64(salt),
    iv: arrayBufferToBase64(iv),
  };
}

/**
 * Unwrap (decrypt) a CryptoKey using a passphrase-derived key.
 *
 * @param {string} wrappedKeyBase64
 * @param {string} saltBase64
 * @param {string} ivBase64
 * @param {string} passphrase
 * @returns {Promise<CryptoKey>} — non-extractable ECDH private key
 */
export async function unwrapKeyWithPassphrase(wrappedKeyBase64, saltBase64, ivBase64, passphrase) {
  const wrappedKey = base64ToArrayBuffer(wrappedKeyBase64);
  const salt = new Uint8Array(base64ToArrayBuffer(saltBase64));
  const iv = new Uint8Array(base64ToArrayBuffer(ivBase64));
  const wrappingKey = await deriveWrappingKey(passphrase, salt);

  return crypto.subtle.unwrapKey(
    "pkcs8",
    wrappedKey,
    wrappingKey,
    { name: "AES-GCM", iv },
    { name: "ECDH", namedCurve: "P-256" },
    false, // non-extractable — cannot be re-exported
    ["deriveBits", "deriveKey"]
  );
}
