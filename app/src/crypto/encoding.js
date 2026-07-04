// ============================================================
// BlockChat Encoding Helpers
// ============================================================
// Pure utility functions — no crypto or state.
// ============================================================

/**
 * Convert ArrayBuffer → Base64 string.
 */
export function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Convert Base64 string → ArrayBuffer.
 * Throws on invalid input.
 */
export function base64ToArrayBuffer(base64) {
  if (typeof base64 !== "string" || base64.length === 0) {
    throw new Error("Invalid base64 input");
  }
  try {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  } catch {
    throw new Error("Malformed base64 string");
  }
}

/**
 * Convert ArrayBuffer → hex string.
 */
export function arrayBufferToHex(buffer) {
  const bytes = new Uint8Array(buffer);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Convert hex string → ArrayBuffer.
 * Validates hex format.
 */
export function hexToArrayBuffer(hex) {
  if (typeof hex !== "string" || hex.length % 2 !== 0 || !/^[0-9a-fA-F]*$/.test(hex)) {
    throw new Error("Invalid hex string");
  }
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes.buffer;
}

/**
 * Securely zero out a Uint8Array (best-effort in JS).
 */
export function zeroOut(arr) {
  if (arr instanceof Uint8Array) {
    arr.fill(0);
  }
}
