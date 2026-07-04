/**
 * @file security/rateLimiter.js
 * @description UNIFIED per-IP and per-wallet rate limiting.
 *
 * FINAL HARDENING — unified rate limiting:
 *   HTTP and Socket.io now share the SAME Redis sorted-set bucket per wallet.
 *   Both channels use `checkWalletRate(walletAddress, limit)` which keys on
 *   the lowercased address — so 1 budget across all entry points.
 *
 *   Previously, socket used `relayId` (hashed) and HTTP used raw address
 *   as separate keys, giving an attacker 2× the budget.
 */

const rateLimit = require("express-rate-limit");
const { getRedis, prefix } = require("../queue/redis");

// ── HTTP Rate Limiters (express-rate-limit, per-IP) ─────────────────

const challengeLimiter = rateLimit({
  windowMs: 60_000,
  max: parseInt(process.env.RATE_LIMIT_CHALLENGE_PER_MIN || "10", 10),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests" },
});

const apiLimiter = rateLimit({
  windowMs: 60_000,
  max: parseInt(process.env.RATE_LIMIT_API_PER_MIN || "100", 10),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests" },
});

const uploadLimiter = rateLimit({
  windowMs: 60_000,
  max: parseInt(process.env.RATE_LIMIT_UPLOAD_PER_MIN || "20", 10),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests" },
});

// ── Unified Per-Wallet Rate Limiter (Redis sliding window) ──────────

const DEFAULT_WALLET_LIMIT = parseInt(process.env.RATE_LIMIT_WALLET_PER_MIN || "60", 10);

/**
 * Unified wallet rate check — shared by HTTP middleware AND socket handlers.
 *
 * KEY DESIGN: Both channels use `rate:wallet:<address_lowercase>` so the
 * budget is truly shared. An attacker sending 50 msgs via socket only has
 * 10 remaining via HTTP (for a 60/min limit).
 *
 * @param {string} walletAddress - Raw Ethereum address (lowercased internally)
 * @param {number} [maxPerMin]   - Per-minute cap
 * @returns {Promise<boolean>}   - true if allowed
 */
async function checkWalletRate(walletAddress, maxPerMin) {
  const limit = maxPerMin || DEFAULT_WALLET_LIMIT;
  const redis = getRedis();
  const key = prefix(`rate:wallet:${walletAddress.toLowerCase()}`);
  const now = Date.now();
  const windowStart = now - 60_000;

  const pipeline = redis.pipeline();
  pipeline.zremrangebyscore(key, 0, windowStart);
  pipeline.zadd(key, now, `${now}:${Math.random()}`);
  pipeline.zcard(key);
  pipeline.expire(key, 120);
  const results = await pipeline.exec();

  const count = results[2][1];
  return count <= limit;
}

/**
 * HTTP middleware — checks unified wallet rate.
 * Requires `req.user.sub` (applied after requireAuth).
 */
function walletRateLimiter(maxPerMin) {
  return async (req, res, next) => {
    if (!req.user?.sub) return next();
    const allowed = await checkWalletRate(req.user.sub, maxPerMin);
    if (!allowed) {
      return res.status(429).json({ error: "Too many requests" });
    }
    next();
  };
}

module.exports = {
  challengeLimiter,
  apiLimiter,
  uploadLimiter,
  checkWalletRate,
  walletRateLimiter,
};
