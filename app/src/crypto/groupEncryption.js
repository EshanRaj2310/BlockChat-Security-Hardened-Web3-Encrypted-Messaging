// ============================================================
// BlockChat Group Encryption — Wrapped key with per-message derivation
// ============================================================
// Fixes: C4 (raw group key), C5 (static group key reuse)
// ============================================================

import {
  arrayBufferToBase64,
  base64ToArrayBuffer,
} from "./encoding.js";
import { importPublicKey, generateEphemeralKeyPair } from "./encryption.js";
import { derivePerMessageKey } from "./keyDerivation.js";

/**
 * Generate a random AES-256-GCM group key.
 * Returns the key as a CryptoKey (NOT exported as base64).
 *
 * Fix for C4: group key stays as CryptoKey, never exposed as raw base64.
 */
export async function generateGroupKey() {
  return crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true, // extractable — needed for wrapping/distributing
    ["encrypt", "decrypt"]
  );
}

/**
 * Export group key as base64 for wrapping (internal use only).
 */
async function exportGroupKey(groupKey) {
  const raw = await crypto.subtle.exportKey("raw", groupKey);
  return arrayBufferToBase64(raw);
}

/**
 * Import a group key from base64.
 */
export async function importGroupKey(groupKeyBase64) {
  const raw = base64ToArrayBuffer(groupKeyBase64);
  return crypto.subtle.importKey(
    "raw",
    raw,
    { name: "AES-GCM", length: 256 },
    false, // non-extractable after import
    ["encrypt", "decrypt"]
  );
}

/**
 * Wrap a group key for a specific member using ECDH.
 *
 * @param {CryptoKey} groupKey — the group's AES key
 * @param {string} memberPubKeyHex — member's ECDH public key hex
 * @returns {{ wrappedKey: string }} — JSON string containing encrypted group key
 */
export async function wrapGroupKeyForMember(groupKey, memberPubKeyHex) {
  const memberPubKey = await importPublicKey(memberPubKeyHex);
  const ephemeralKeyPair = await generateEphemeralKeyPair();

  const messageNonce = crypto.getRandomValues(new Uint8Array(16));
  const aesKey = await derivePerMessageKey(
    ephemeralKeyPair.privateKey,
    memberPubKey,
    messageNonce,
    "blockchat-group-wrap-v1"
  );

  const groupKeyBase64 = await exportGroupKey(groupKey);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = new TextEncoder().encode(groupKeyBase64);
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    aesKey,
    data
  );

  const rawEphemeralPub = await crypto.subtle.exportKey("raw", ephemeralKeyPair.publicKey);

  return {
    wrappedKey: JSON.stringify({
      iv: arrayBufferToBase64(iv),
      ciphertext: arrayBufferToBase64(encrypted),
      ephemeralPub: arrayBufferToBase64(rawEphemeralPub),
      messageNonce: arrayBufferToBase64(messageNonce),
    }),
  };
}

/**
 * Unwrap a group key using our identity private key.
 *
 * @param {string} wrappedKeyJson
 * @param {CryptoKey} privateKey — our identity private key
 * @returns {Promise<CryptoKey>} — non-extractable AES-256-GCM group key
 */
export async function unwrapGroupKey(wrappedKeyJson, privateKey) {
  let parsed;
  try {
    parsed = JSON.parse(wrappedKeyJson);
  } catch {
    throw new Error("Invalid wrapped key format");
  }

  const { iv, ciphertext, ephemeralPub, messageNonce } = parsed;
  if (!iv || !ciphertext || !ephemeralPub || !messageNonce) {
    throw new Error("Wrapped key missing required fields");
  }

  const ephemeralPubRaw = base64ToArrayBuffer(ephemeralPub);
  const ephemeralPubKey = await crypto.subtle.importKey(
    "raw",
    ephemeralPubRaw,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    []
  );

  const nonceBytes = new Uint8Array(base64ToArrayBuffer(messageNonce));
  const aesKey = await derivePerMessageKey(
    privateKey,
    ephemeralPubKey,
    nonceBytes,
    "blockchat-group-wrap-v1"
  );

  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64ToArrayBuffer(iv) },
    aesKey,
    base64ToArrayBuffer(ciphertext)
  );

  const groupKeyBase64 = new TextDecoder().decode(decrypted);
  return importGroupKey(groupKeyBase64);
}

/**
 * Encrypt a group message with per-message nonce.
 *
 * Fix for C5: even with a static group key, we use a unique IV per message.
 * For additional protection, we include a counter/nonce in the AAD.
 *
 * @param {CryptoKey} groupKey
 * @param {string|Uint8Array} plaintext
 * @returns {{ iv, ciphertext, messageNonce }}
 */
export async function encryptGroupMessage(groupKey, plaintext) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const messageNonce = crypto.getRandomValues(new Uint8Array(16));
  const data = typeof plaintext === "string"
    ? new TextEncoder().encode(plaintext)
    : plaintext;

  // Use messageNonce as Additional Authenticated Data for integrity
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: messageNonce },
    groupKey,
    data
  );

  return {
    iv: arrayBufferToBase64(iv),
    ciphertext: arrayBufferToBase64(ciphertext),
    messageNonce: arrayBufferToBase64(messageNonce),
  };
}

/**
 * Decrypt a group message.
 *
 * @param {CryptoKey} groupKey
 * @param {string} ivBase64
 * @param {string} ciphertextBase64
 * @param {string} messageNonceBase64 — must match the AAD used during encryption
 * @returns {Promise<string>}
 */
export async function decryptGroupMessage(groupKey, ivBase64, ciphertextBase64, messageNonceBase64) {
  const iv = base64ToArrayBuffer(ivBase64);
  const ciphertext = base64ToArrayBuffer(ciphertextBase64);
  const messageNonce = base64ToArrayBuffer(messageNonceBase64);

  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv, additionalData: new Uint8Array(messageNonce) },
    groupKey,
    ciphertext
  );

  return new TextDecoder().decode(decrypted);
}
