/**
 * @file auth/jwt.js
 * @description JWT issuance, verification, and revocation.
 *
 * FINAL HARDENING — token versioning:
 *   Each user has a `ver` (version) counter stored in Redis.
 *   Every issued JWT includes the current version. On verify, we check
 *   that the token's version matches the stored version.
 *
 *   Logout increments the version → all existing tokens for that user
 *   become invalid immediately. Cost: 1 Redis GET per verification.
 *
 *   This is more efficient than storing every revoked token because:
 *   - Only ONE Redis key per user (not per token)
 *   - Logout invalidates ALL sessions at once
 *   - No TTL cleanup needed — keys are tiny integers
 */

const jwt = require("jsonwebtoken");
const { getRedis, prefix } = require("../queue/redis");

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRY = process.env.JWT_EXPIRY || "2h";

// SECURITY [NEW-01 FIX]: crash immediately if JWT_SECRET is missing or weak.
if (!JWT_SECRET || JWT_SECRET.length < 32) {
  console.error("FATAL: JWT_SECRET must be set in .env (minimum 32 characters)");
  process.exit(1);
}

/**
 * Issue a JWT with the current token version for the wallet.
 * @param {string} address - Verified Ethereum address
 * @returns {Promise<string>} Signed JWT
 */
async function issueToken(address) {
  const redis = getRedis();
  const verKey = prefix(`tokenver:${address.toLowerCase()}`);

  // Get or initialize the version counter (starts at 1)
  let ver = await redis.get(verKey);
  if (!ver) {
    await redis.set(verKey, "1");
    ver = "1";
  }

  return jwt.sign(
    { sub: address, ver: parseInt(ver, 10) },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRY }
  );
}

/**
 * Verify a JWT: signature + expiry + token version.
 *
 * @param {string} token - JWT string
 * @returns {Promise<{sub: string, ver: number, iat: number, exp: number} | null>}
 */
async function verifyToken(token) {
  try {
    const decoded = jwt.verify(token, JWT_SECRET, { algorithms: ["HS256"] });

    // Check token version against Redis
    const redis = getRedis();
    const verKey = prefix(`tokenver:${decoded.sub.toLowerCase()}`);
    const currentVer = await redis.get(verKey);

    // If no version exists, user never logged in via new system — accept
    // (first login will set the version). If version mismatch → revoked.
    if (currentVer && decoded.ver !== parseInt(currentVer, 10)) {
      return null; // Token version is stale → revoked
    }

    return decoded;
  } catch {
    return null;
  }
}

/**
 * Revoke all tokens for a wallet by incrementing the version counter.
 * All existing JWTs with older `ver` values become invalid immediately.
 *
 * @param {string} address - Ethereum address to revoke
 */
async function revokeAllTokens(address) {
  const redis = getRedis();
  const verKey = prefix(`tokenver:${address.toLowerCase()}`);
  await redis.incr(verKey);
}

/**
 * Express middleware: require valid JWT in Authorization header.
 * Now async to support Redis-backed version check.
 */
async function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Authentication required" });
  }

  const decoded = await verifyToken(header.slice(7));
  if (!decoded) {
    return res.status(401).json({ error: "Authentication required" });
  }

  req.user = decoded;
  next();
}

module.exports = { issueToken, verifyToken, requireAuth, revokeAllTokens };
