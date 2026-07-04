/**
 * @file queue/messageQueue.js
 * @description Redis-backed TTL message queue for offline delivery.
 *
 * SECURITY RATIONALE (replaces in-memory Map):
 *   1. Messages auto-expire via Redis TTL — no indefinite retention
 *   2. Survives short server restarts (Redis persistence)
 *   3. Enforces per-user queue depth limit to prevent memory exhaustion DoS
 *   4. Messages are deleted immediately after successful delivery
 *   5. Queue keys are keyed by opaque relay ID, not raw address
 */

const { getRedis, prefix } = require("./redis");

const PENDING_TTL = parseInt(process.env.PENDING_MSG_TTL_SECONDS || "86400", 10); // 24h
const MAX_PER_USER = parseInt(process.env.PENDING_MSG_MAX_PER_USER || "100", 10);

/**
 * Enqueue a message for an offline recipient.
 * Payload is stored as a JSON string — server treats it as opaque.
 *
 * SECURITY [VULN-04 FIX]: Uses Lua script for atomic check-and-push.
 * The original LLEN→RPUSH sequence was vulnerable to TOCTOU race:
 * 200 concurrent events could all read len=99 and all push, exceeding
 * the cap. Lua scripts execute atomically in Redis — no race possible.
 *
 * @param {string} relayId  - Recipient's opaque relay ID (not raw address)
 * @param {object} payload  - Message payload (CID + metadata, no plaintext)
 * @returns {Promise<boolean>} true if queued, false if queue full
 */
const ENQUEUE_SCRIPT = `
  local len = redis.call('llen', KEYS[1])
  if len >= tonumber(ARGV[1]) then return 0 end
  redis.call('rpush', KEYS[1], ARGV[2])
  redis.call('expire', KEYS[1], tonumber(ARGV[3]))
  return 1
`;

async function enqueueMessage(relayId, payload) {
  const redis = getRedis();
  const key = prefix(`pending:${relayId}`);
  const result = await redis.eval(
    ENQUEUE_SCRIPT, 1, key,
    MAX_PER_USER, JSON.stringify(payload), PENDING_TTL
  );
  return result === 1;
}

/**
 * Drain all pending messages for a recipient and delete the queue.
 *
 * SECURITY [NEW-04 FIX]: Uses Lua script for atomic drain.
 * The original LRANGE→DEL pipeline had a race: a message arriving
 * between the two commands would be deleted without being read.
 *
 * @param {string} relayId - Recipient's opaque relay ID
 * @returns {Promise<object[]>} Array of queued message payloads
 */
const DRAIN_SCRIPT = `
  local items = redis.call('lrange', KEYS[1], 0, -1)
  redis.call('del', KEYS[1])
  return items
`;

async function drainMessages(relayId) {
  const redis = getRedis();
  const key = prefix(`pending:${relayId}`);
  const raw = await redis.eval(DRAIN_SCRIPT, 1, key) || [];
  return raw.map((item) => {
    try { return JSON.parse(item); }
    catch { return null; }
  }).filter(Boolean);
}

/**
 * Delete a specific message by ID from a user's queue (post-delivery cleanup).
 * This is best-effort — if the message expired via TTL, no error is raised.
 */
async function deleteDelivered(relayId, messageId) {
  const redis = getRedis();
  const key = prefix(`pending:${relayId}`);
  // LREM removes the first matching element — O(N) but queues are small (≤100)
  const items = await redis.lrange(key, 0, -1);
  for (const item of items) {
    try {
      const parsed = JSON.parse(item);
      if (parsed.messageId === messageId) {
        await redis.lrem(key, 1, item);
        break;
      }
    } catch { /* skip malformed entries */ }
  }
}

module.exports = { enqueueMessage, drainMessages, deleteDelivered };
