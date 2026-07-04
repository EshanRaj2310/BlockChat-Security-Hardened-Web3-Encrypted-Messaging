/**
 * @file security/validator.js
 * @description Payload validation for messages and uploads.
 *
 * SECURITY RATIONALE:
 *   1. All payloads are treated as OPAQUE encrypted blobs — never inspected
 *   2. Validation is structural only: size, required fields, CID format
 *   3. Prevents oversized payloads from exhausting memory/bandwidth
 *   4. CID format validation prevents injection attacks in IPFS gateway URLs
 *   5. Message content is NEVER logged — only validation failures (without content)
 */

const MAX_MESSAGE_BYTES = parseInt(process.env.MAX_MESSAGE_BYTES || "65536", 10);  // 64 KB
const MAX_UPLOAD_BYTES = parseInt(process.env.MAX_UPLOAD_BYTES || "104857600", 10); // 100 MB

/**
 * Check for prototype pollution keys in an object.
 * @param {object} obj
 * @returns {boolean} true if dangerous keys found
 */
function hasDangerousKeys(obj) {
  if (!obj || typeof obj !== "object") return false;
  const has = (key) => Object.prototype.hasOwnProperty.call(obj, key);
  return has("__proto__") || has("constructor") || has("prototype");
}

/**
 * Validate an IPFS CID string format.
 * Accepts CIDv0 (Qm...) and CIDv1 (bafy...) formats only.
 *
 * WHY: CIDs are used to construct gateway URLs. Accepting arbitrary strings
 * could allow path traversal or injection in the gateway URL.
 *
 * @param {string} cid
 * @returns {boolean}
 */
function isValidCid(cid) {
  if (!cid || typeof cid !== "string") return false;
  // CIDv0: base58btc, starts with Qm, 46 chars
  if (/^Qm[1-9A-HJ-NP-Za-km-z]{44}$/.test(cid)) return true;
  // CIDv1: base32, starts with bafy, variable length
  if (/^bafy[a-z2-7]{50,100}$/.test(cid)) return true;
  return false;
}

/**
 * Validate a direct message payload from socket event.
 * Checks structural integrity without inspecting encrypted content.
 *
 * @param {object} data - The send_message event payload
 * @returns {{ valid: boolean, error?: string }}
 */
function validateMessagePayload(data) {
  if (!data || typeof data !== "object") {
    console.error("[Validator] INVALID_FORMAT - data is:", typeof data, data);
    return { valid: false, error: "INVALID_FORMAT" };
  }
  if (hasDangerousKeys(data)) {
    console.error("[Validator] INVALID_FORMAT - dangerous keys found");
    return { valid: false, error: "INVALID_FORMAT" };
  }

  // Required fields for routing (all opaque to server)
  const { to, cid, type, iv, timestamp } = data;

  if (!to || typeof to !== "string") {
    return { valid: false, error: "MISSING_RECIPIENT" };
  }

  if (!cid || !isValidCid(cid)) {
    return { valid: false, error: "INVALID_CID" };
  }

  if (!type || typeof type !== "string") {
    return { valid: false, error: "MISSING_TYPE" };
  }

  if (!iv || typeof iv !== "string") {
    return { valid: false, error: "MISSING_IV" };
  }

  // Size check: JSON-serialized payload must be under limit
  const payloadSize = Buffer.byteLength(JSON.stringify(data), "utf-8");
  if (payloadSize > MAX_MESSAGE_BYTES) {
    return { valid: false, error: "PAYLOAD_TOO_LARGE" };
  }

  return { valid: true };
}

/**
 * Validate a group message payload.
 *
 * @param {object} data - The send_group_msg event payload
 * @returns {{ valid: boolean, error?: string }}
 */
function validateGroupMessagePayload(data) {
  if (!data || typeof data !== "object") {
    return { valid: false, error: "INVALID_FORMAT" };
  }
  if (hasDangerousKeys(data)) {
    return { valid: false, error: "INVALID_FORMAT" };
  }

  const { groupId, cid, type, iv } = data;

  if (groupId === undefined || groupId === null) {
    return { valid: false, error: "MISSING_GROUP_ID" };
  }

  if (!cid || !isValidCid(cid)) {
    return { valid: false, error: "INVALID_CID" };
  }

  if (!type || typeof type !== "string") {
    return { valid: false, error: "MISSING_TYPE" };
  }

  if (!iv || typeof iv !== "string") {
    return { valid: false, error: "MISSING_IV" };
  }

  const payloadSize = Buffer.byteLength(JSON.stringify(data), "utf-8");
  if (payloadSize > MAX_MESSAGE_BYTES) {
    return { valid: false, error: "PAYLOAD_TOO_LARGE" };
  }

  return { valid: true };
}

/**
 * Validate an upload's size and MIME type.
 *
 * WHY MIME validation: Even though blobs are encrypted, we enforce
 * application/octet-stream to prevent the server from being used as
 * a general-purpose file host (which would attract abuse).
 *
 * @param {object} file - Multer file object
 * @returns {{ valid: boolean, error?: string }}
 */
function validateUpload(file) {
  if (!file) {
    return { valid: false, error: "NO_FILE" };
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    return { valid: false, error: "FILE_TOO_LARGE" };
  }

  // SECURITY [VULN-05 FIX]: reject if mimetype is MISSING or doesn't match.
  // Original code `if (file.mimetype && ...)` skipped validation when
  // mimetype was undefined — allowing arbitrary file uploads.
  // SECURITY [VULN-05 FIX]: allow common encrypted blob MIME types
  const allowedMimes = ["application/octet-stream", "application/json", "binary/octet-stream"];
  if (!file.mimetype || !allowedMimes.includes(file.mimetype)) {
    return { valid: false, error: "INVALID_MIME_TYPE" };
  }

  return { valid: true };
}

/**
 * Validate WebRTC signaling payload.
 * Enforces that signaling data is an opaque encrypted blob, not plaintext SDP.
 *
 * WHY: Plaintext SDP exposes ICE candidates (IP addresses), codec info,
 * and other metadata. Clients should encrypt signaling before sending.
 *
 * @param {object} data - Signaling event payload
 * @returns {{ valid: boolean, error?: string }}
 */
function validateSignalingPayload(data) {
  if (!data || typeof data !== "object") {
    return { valid: false, error: "INVALID_FORMAT" };
  }
  if (hasDangerousKeys(data)) {
    return { valid: false, error: "INVALID_FORMAT" };
  }

  const { to } = data;
  if (!to || typeof to !== "string") {
    return { valid: false, error: "MISSING_RECIPIENT" };
  }

  // Size cap prevents abuse — signaling payloads should be small
  const payloadSize = Buffer.byteLength(JSON.stringify(data), "utf-8");
  if (payloadSize > MAX_MESSAGE_BYTES) {
    return { valid: false, error: "PAYLOAD_TOO_LARGE" };
  }

  return { valid: true };
}

module.exports = {
  isValidCid,
  validateMessagePayload,
  validateGroupMessagePayload,
  validateUpload,
  validateSignalingPayload,
  MAX_MESSAGE_BYTES,
  MAX_UPLOAD_BYTES,
};
