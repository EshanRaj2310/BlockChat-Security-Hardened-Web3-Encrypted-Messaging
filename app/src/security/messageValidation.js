// ============================================================
// BlockChat Message Validation — Anti-replay, schema validation
// ============================================================
// Fixes: R1 (message ID forgery), R2 (timestamp validation),
//        R3 (replay tracking), N1/N3 (blind server trust)
// ============================================================

import {
  sanitizeText,
  sanitizeFilename,
  isValidAddress,
  isValidBase64,
  isValidCID,
} from "./sanitize.js";

// ---- Replay protection ----

// Sliding window of seen message IDs (in-memory + bounded)
const SEEN_MESSAGES = new Map(); // messageId → timestamp
const MAX_SEEN = 10000;
const MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Check if a message ID has been seen before.
 * Returns true if it's a duplicate (replay).
 *
 * @param {string} messageId
 * @returns {boolean}
 */
export function isDuplicate(messageId) {
  if (!messageId || typeof messageId !== "string") return true;
  return SEEN_MESSAGES.has(messageId);
}

/**
 * Mark a message ID as seen.
 *
 * @param {string} messageId
 */
export function markSeen(messageId) {
  if (!messageId) return;
  SEEN_MESSAGES.set(messageId, Date.now());
  _pruneOldEntries();
}

/**
 * Remove entries older than MAX_AGE_MS or when map exceeds MAX_SEEN.
 */
function _pruneOldEntries() {
  if (SEEN_MESSAGES.size <= MAX_SEEN) return;
  const now = Date.now();
  for (const [id, ts] of SEEN_MESSAGES) {
    if (now - ts > MAX_AGE_MS || SEEN_MESSAGES.size > MAX_SEEN) {
      SEEN_MESSAGES.delete(id);
    }
  }
}

// ---- Timestamp validation ----

const MAX_CLOCK_DRIFT_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Validate a message timestamp.
 * Rejects messages too far in the past or future.
 *
 * @param {number} timestamp — milliseconds since epoch
 * @returns {{ valid: boolean, reason?: string }}
 */
export function validateTimestamp(timestamp) {
  if (typeof timestamp !== "number" || !isFinite(timestamp)) {
    return { valid: false, reason: "Timestamp is not a valid number" };
  }
  const now = Date.now();
  if (timestamp > now + MAX_CLOCK_DRIFT_MS) {
    return { valid: false, reason: "Timestamp is too far in the future" };
  }
  if (timestamp < now - MAX_AGE_MS) {
    return { valid: false, reason: "Timestamp is too old" };
  }
  return { valid: true };
}

// ---- Message schema validation ----

/**
 * Validate an incoming DM message payload from the socket.
 *
 * IMPORTANT: The backend relay sends:
 *   { from, cid, type, iv, ephemeralPub, selfDestruct, timestamp, messageId }
 *
 * The actual encrypted content (ciphertext, messageNonce) is inside the
 * IPFS blob referenced by `cid`. The frontend must download the blob,
 * parse it, and then decrypt.
 *
 * @param {object} data — raw socket payload
 * @returns {object} sanitized payload
 */
export function validateIncomingMessage(data) {
  if (!data || typeof data !== "object") {
    throw new Error("Invalid message: not an object");
  }

  // Required fields that the backend relay actually sends
  const requiredFields = ["from", "messageId", "cid", "type", "iv"];
  for (const field of requiredFields) {
    if (data[field] === undefined || data[field] === null) {
      throw new Error(`Invalid message: missing field '${field}'`);
    }
  }

  // Validate sender address
  if (!isValidAddress(data.from)) {
    throw new Error("Invalid message: malformed sender address");
  }

  // Validate messageId format (backend generates UUIDs)
  if (typeof data.messageId !== "string" || data.messageId.length < 5 || data.messageId.length > 128) {
    throw new Error("Invalid message: malformed messageId");
  }

  // Validate timestamp (optional — backend may not always include it)
  if (data.timestamp !== undefined) {
    const tsResult = validateTimestamp(data.timestamp);
    if (!tsResult.valid) {
      throw new Error(`Invalid message: ${tsResult.reason}`);
    }
  }

  // Replay check
  if (isDuplicate(data.messageId)) {
    throw new Error("Duplicate message: possible replay attack");
  }

  // Validate CID format
  if (!isValidCID(data.cid)) {
    throw new Error("Invalid message: malformed CID");
  }

  // Mark as seen
  markSeen(data.messageId);

  // Return sanitized payload
  return {
    from: data.from,
    to: data.to || undefined,
    messageId: data.messageId,
    timestamp: data.timestamp || Date.now(),
    type: sanitizeText(data.type || "text", 32),
    cid: data.cid,
    iv: data.iv,
    ephemeralPub: data.ephemeralPub || undefined,
    selfDestruct: typeof data.selfDestruct === "number" ? data.selfDestruct : undefined,
  };
}

/**
 * Validate an incoming file message payload.
 */
export function validateIncomingFileMessage(data) {
  const base = validateIncomingMessage(data);

  if (data.cid && !isValidCID(data.cid)) {
    throw new Error("Invalid message: malformed CID");
  }

  return {
    ...base,
    cid: data.cid || undefined,
    filename: data.filename ? sanitizeFilename(data.filename) : undefined,
    mime: typeof data.mime === "string" ? sanitizeText(data.mime, 128) : undefined,
  };
}

/**
 * Validate socket response payloads (generic).
 */
export function validateSocketPayload(data, requiredFields = []) {
  if (!data || typeof data !== "object") {
    throw new Error("Invalid socket payload: not an object");
  }
  for (const field of requiredFields) {
    if (data[field] === undefined) {
      throw new Error(`Invalid socket payload: missing '${field}'`);
    }
  }
  return data;
}
