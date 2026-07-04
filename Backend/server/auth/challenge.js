/**
 * @file auth/challenge.js
 * @description Nonce-based wallet challenge system backed by Redis.
 *
 * SECURITY RATIONALE (fixes from v1):
 *   1. Nonces stored in Redis with strict TTL — prevents replay attacks
 *      across server restarts (v1 used in-memory Map that reset on restart)
 *   2. One-time use: nonce is atomically deleted on verification via GETDEL
 *   3. Per-address scoping prevents cross-address nonce reuse
 *   4. Cryptographically random 32-byte nonces (not predictable)
 *   5. No IP↔address mapping is logged at any point
 */

const crypto = require("crypto");
const { getRedis, prefix } = require("../queue/redis");

const NONCE_TTL = parseInt(process.env.NONCE_TTL_SECONDS || "60", 10);

/**
 * Generate and store a cryptographic nonce for wallet authentication.
 * The nonce is bound to a specific address and auto-expires.
 *
 * @param {string} address - Ethereum address requesting the challenge
 * @returns {Promise<string>} The hex-encoded challenge nonce
 */
async function createChallenge(address) {
  const redis = getRedis();
  const nonce = crypto.randomBytes(32).toString("hex");
  const key = prefix(`nonce:${address.toLowerCase()}`);

  // SECURITY: SET with EX ensures the nonce auto-expires even if never consumed.
  // NX is intentionally NOT used — a new challenge overwrites any pending one,
  // which is safe because only the latest nonce is valid.
  await redis.set(key, nonce, "EX", NONCE_TTL);

  return nonce;
}

/**
 * Consume and return the stored nonce for verification.
 * Uses GETDEL for atomic read-and-delete (one-time use).
 *
 * @param {string} address - Ethereum address to look up
 * @returns {Promise<string|null>} The nonce if valid, null if expired/consumed
 */
async function consumeChallenge(address) {
  const redis = getRedis();
  const key = prefix(`nonce:${address.toLowerCase()}`);

  // SECURITY: GETDEL is atomic — prevents race conditions where the same
  // nonce could be verified twice in concurrent requests
  const nonce = await redis.getdel(key);
  return nonce; // null if expired or already consumed
}

/**
 * Generate a nonce for registration with domain separation.
 * Returns metadata needed for canonical payload signing.
 */
async function createRegisterChallenge(address) {
  const redis = getRedis();
  const nonce = crypto.randomBytes(32).toString("hex");
  const key = prefix(`reg_nonce:${address.toLowerCase()}`);
  
  const issuedAt = Date.now();
  const ttl = 300; // 5 minutes
  const expiresAt = issuedAt + ttl * 1000;

  const data = JSON.stringify({ nonce, issuedAt, expiresAt });
  await redis.set(key, data, "EX", ttl);

  return { nonce, issuedAt, expiresAt };
}

/**
 * Consume a registration challenge.
 */
async function consumeRegisterChallenge(address) {
  const redis = getRedis();
  const key = prefix(`reg_nonce:${address.toLowerCase()}`);
  
  const data = await redis.getdel(key);
  if (!data) return null;
  try {
    return JSON.parse(data);
  } catch {
    return null;
  }
}

module.exports = { 
  createChallenge, 
  consumeChallenge, 
  createRegisterChallenge, 
  consumeRegisterChallenge 
};
