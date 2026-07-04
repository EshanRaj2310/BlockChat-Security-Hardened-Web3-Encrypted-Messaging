// ============================================================
// BlockChat Encryption/Decryption — Secure message crypto
// ============================================================
// Fixes: C2 (HKDF), C5 (per-message keys), C1 (non-extractable)
// ============================================================

import {
  arrayBufferToBase64,
  base64ToArrayBuffer,
  arrayBufferToHex,
  hexToArrayBuffer,
} from "./encoding.js";
import { derivePerMessageKey } from "./keyDerivation.js";
import { getPrivateKey } from "./keyStorage.js";

/**
 * Import a recipient's ECDH P-256 public key from hex string.
 * Validates hex length for P-256 uncompressed point (65 bytes = 130 hex chars).
 */
export async function importPublicKey(hexPubKey) {
  if (typeof hexPubKey !== "string") {
    throw new Error("Public key must be a string");
  }
  const clean = hexPubKey.toLowerCase().replace(/^0x/, "");
  if (clean.length !== 130) {
    throw new Error(`Invalid public key length: expected 130 hex chars, got ${clean.length}`);
  }
  const raw = hexToArrayBuffer(clean);
  return crypto.subtle.importKey(
    "raw",
    raw,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    []
  );
}

/**
 * Generate an ephemeral ECDH keypair for a single message.
 * Private key is extractable = false (we only need deriveBits).
 */
export async function generateEphemeralKeyPair() {
  return crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true, // need true to export the public key
    ["deriveBits", "deriveKey"]
  );
}

/**
 * Encrypt plaintext with AES-256-GCM using a per-message key.
 *
 * Flow:
 *  1. Generate ephemeral ECDH keypair
 *  2. Generate per-message nonce (16 bytes)
 *  3. Derive unique AES key via HKDF(ECDH, nonce)
 *  4. Encrypt with AES-GCM (12-byte IV)
 *  5. Return all components needed for decryption
 *
 * @param {string} recipientPubKeyHex
 * @param {string|Uint8Array} plaintext
 * @returns {{ iv, ciphertext, ephemeralPubBase64, messageNonce }}
 */
export async function encryptForRecipient(recipientPubKeyHex, plaintext) {
  const recipientPubKey = await importPublicKey(recipientPubKeyHex);
  const ephemeralKeyPair = await generateEphemeralKeyPair();

  // Per-message nonce for HKDF salt — ensures unique key per message
  const messageNonce = crypto.getRandomValues(new Uint8Array(16));

  // Derive per-message AES key: ECDH(ephemeral, recipient) → HKDF(nonce) → AES-256
  const aesKey = await derivePerMessageKey(
    ephemeralKeyPair.privateKey,
    recipientPubKey,
    messageNonce,
    "blockchat-dm-v1"
  );

  // AES-GCM encrypt
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = typeof plaintext === "string"
    ? new TextEncoder().encode(plaintext)
    : plaintext;
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    aesKey,
    data
  );

  // Export ephemeral public key
  const rawEphemeralPub = await crypto.subtle.exportKey("raw", ephemeralKeyPair.publicKey);

  return {
    iv: arrayBufferToBase64(iv),
    ciphertext: arrayBufferToBase64(encrypted),
    ephemeralPubBase64: arrayBufferToBase64(rawEphemeralPub),
    messageNonce: arrayBufferToBase64(messageNonce),
  };
}

/**
 * Encrypt file data with AES-256-GCM using a per-message key.
 * Uses 'blockchat-file-v1' derivation tag.
 *
 * @param {string} recipientPubKeyHex
 * @param {Uint8Array} fileData
 * @returns {{ iv, ciphertext, ephemeralPubBase64, messageNonce }}
 */
export async function encryptFileForRecipient(recipientPubKeyHex, fileData) {
  const recipientPubKey = await importPublicKey(recipientPubKeyHex);
  const ephemeralKeyPair = await generateEphemeralKeyPair();

  const messageNonce = crypto.getRandomValues(new Uint8Array(16));
  const aesKey = await derivePerMessageKey(
    ephemeralKeyPair.privateKey,
    recipientPubKey,
    messageNonce,
    "blockchat-file-v1"
  );

  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    aesKey,
    fileData
  );

  const rawEphemeralPub = await crypto.subtle.exportKey("raw", ephemeralKeyPair.publicKey);

  return {
    iv: arrayBufferToBase64(iv),
    ciphertext: arrayBufferToBase64(encrypted),
    ephemeralPubBase64: arrayBufferToBase64(rawEphemeralPub),
    messageNonce: arrayBufferToBase64(messageNonce),
  };
}

/**
 * Decrypt a message using our stored identity key.
 *
 * @param {string} ephemeralPubBase64 — sender's ephemeral public key
 * @param {string} ivBase64
 * @param {string} ciphertextBase64
 * @param {string} messageNonceBase64 — per-message HKDF salt
 * @returns {Promise<string>} decrypted plaintext
 */
export async function decryptFromSender(ephemeralPubBase64, ivBase64, ciphertextBase64, messageNonceBase64) {
  const privateKey = getPrivateKey(); // throws if locked

  const ephemeralPubRaw = base64ToArrayBuffer(ephemeralPubBase64);
  const ephemeralPubKey = await crypto.subtle.importKey(
    "raw",
    ephemeralPubRaw,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    []
  );

  const messageNonce = new Uint8Array(base64ToArrayBuffer(messageNonceBase64));
  const aesKey = await derivePerMessageKey(
    privateKey,
    ephemeralPubKey,
    messageNonce,
    "blockchat-dm-v1"
  );

  const iv = base64ToArrayBuffer(ivBase64);
  const ciphertext = base64ToArrayBuffer(ciphertextBase64);
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    aesKey,
    ciphertext
  );

  return new TextDecoder().decode(decrypted);
}

/**
 * Decrypt binary file data.
 *
 * @returns {Promise<ArrayBuffer>}
 */
export async function decryptFileFromSender(ephemeralPubBase64, ivBase64, ciphertextBase64, messageNonceBase64) {
  const privateKey = getPrivateKey();

  const ephemeralPubRaw = base64ToArrayBuffer(ephemeralPubBase64);
  const ephemeralPubKey = await crypto.subtle.importKey(
    "raw",
    ephemeralPubRaw,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    []
  );

  const messageNonce = new Uint8Array(base64ToArrayBuffer(messageNonceBase64));
  const aesKey = await derivePerMessageKey(
    privateKey,
    ephemeralPubKey,
    messageNonce,
    "blockchat-file-v1"
  );

  const iv = base64ToArrayBuffer(ivBase64);
  const ciphertext = base64ToArrayBuffer(ciphertextBase64);
  return crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    aesKey,
    ciphertext
  );
}

// ============================================================
// Anonymous Mode
// ============================================================

/**
 * Generate ephemeral ECDH keypair for anonymous mode.
 * NOT stored. Caller must discard after use.
 */
export async function generateAnonymousKeyPair() {
  const keyPair = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true, // need to export public key
    ["deriveBits", "deriveKey"]
  );
  const rawPub = await crypto.subtle.exportKey("raw", keyPair.publicKey);
  const publicKeyHex = arrayBufferToHex(rawPub);
  return { privateKey: keyPair.privateKey, publicKeyHex };
}

/**
 * Encrypt anonymously — same as encryptForRecipient.
 */
export async function encryptAnonymous(recipientPubKeyHex, plaintext) {
  return encryptForRecipient(recipientPubKeyHex, plaintext);
}

/**
 * Decrypt using a provided anonymous private key.
 *
 * @param {CryptoKey} anonymousPrivKey
 */
export async function decryptAnonymous(anonymousPrivKey, ephemeralPubBase64, ivBase64, ciphertextBase64, messageNonceBase64) {
  const ephemeralPubRaw = base64ToArrayBuffer(ephemeralPubBase64);
  const ephemeralPubKey = await crypto.subtle.importKey(
    "raw",
    ephemeralPubRaw,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    []
  );

  const messageNonce = new Uint8Array(base64ToArrayBuffer(messageNonceBase64));
  const aesKey = await derivePerMessageKey(
    anonymousPrivKey,
    ephemeralPubKey,
    messageNonce,
    "blockchat-dm-v1"
  );

  const iv = base64ToArrayBuffer(ivBase64);
  const ciphertext = base64ToArrayBuffer(ciphertextBase64);
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    aesKey,
    ciphertext
  );
  return new TextDecoder().decode(decrypted);
}
