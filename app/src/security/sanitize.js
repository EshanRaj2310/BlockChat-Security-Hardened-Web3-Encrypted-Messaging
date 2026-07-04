// ============================================================
// BlockChat Input Sanitization
// ============================================================
// Fixes: X1-X5 (XSS, unsanitized inputs)
// ============================================================

/**
 * Sanitize a string for safe display.
 * Strips HTML tags, control characters, and trims.
 *
 * React's JSX already escapes text nodes, but this provides
 * defense-in-depth for cases where content flows into
 * attributes, URLs, notifications, or non-React contexts.
 *
 * @param {string} input
 * @param {number} maxLength — truncate after this many chars
 * @returns {string}
 */
export function sanitizeText(input, maxLength = 10000) {
  if (typeof input !== "string") return "";

  let clean = input
    // Strip HTML tags
    .replace(/<[^>]*>/g, "")
    // Strip null bytes
    .replace(/\0/g, "")
    // Strip control characters (except newline, tab)
    .replace(/[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
    // Normalize whitespace
    .trim();

  if (clean.length > maxLength) {
    clean = clean.slice(0, maxLength);
  }

  return clean;
}

/**
 * Sanitize a username.
 * Only allows alphanumeric, spaces, underscores, hyphens, dots.
 *
 * @param {string} username
 * @returns {string}
 */
export function sanitizeUsername(username, maxLength = 64) {
  if (typeof username !== "string") return "";
  return username
    .replace(/[^a-zA-Z0-9 _.\-]/g, "")
    .trim()
    .slice(0, maxLength);
}

/**
 * Sanitize a filename.
 * Strips path separators, control chars, and limits length.
 *
 * @param {string} filename
 * @returns {string}
 */
export function sanitizeFilename(filename, maxLength = 255) {
  if (typeof filename !== "string") return "unnamed";
  return filename
    // Remove path separators
    .replace(/[/\\]/g, "")
    // Remove null bytes and control chars
    .replace(/[\x00-\x1F\x7F]/g, "")
    // Remove potentially dangerous characters
    .replace(/[<>:"|?*]/g, "")
    .trim()
    .slice(0, maxLength) || "unnamed";
}

/**
 * Validate an Ethereum address format.
 *
 * @param {string} address
 * @returns {boolean}
 */
export function isValidAddress(address) {
  if (typeof address !== "string") return false;
  return /^0x[0-9a-fA-F]{40}$/.test(address);
}

/**
 * Validate a hex-encoded public key (P-256 uncompressed = 130 hex chars).
 *
 * @param {string} hexKey
 * @returns {boolean}
 */
export function isValidPublicKeyHex(hexKey) {
  if (typeof hexKey !== "string") return false;
  // P-256 uncompressed point: 04 || x (32 bytes) || y (32 bytes) = 65 bytes = 130 hex
  return /^04[0-9a-fA-F]{128}$/.test(hexKey);
}

/**
 * Validate a base64-encoded string.
 *
 * @param {string} str
 * @returns {boolean}
 */
export function isValidBase64(str) {
  if (typeof str !== "string" || str.length === 0) return false;
  try {
    return btoa(atob(str)) === str;
  } catch {
    return false;
  }
}

/**
 * Validate a CID format (IPFS v0 or v1).
 *
 * @param {string} cid
 * @returns {boolean}
 */
export function isValidCID(cid) {
  if (typeof cid !== "string") return false;
  // CIDv0: starts with Qm and is 46 chars (base58)
  // CIDv1: starts with b and contains only base32 chars
  return /^Qm[1-9A-HJ-NP-Za-km-z]{44}$/.test(cid) ||
         /^b[a-z2-7]{58,}$/.test(cid) ||
         // bafy... format
         /^bafy[a-z0-9]{50,}$/.test(cid);
}
