/**
 * @file auth/routes.js
 * @description Wallet-signature authentication HTTP routes.
 *
 * FINAL HARDENING:
 *   - issueToken is now async (Redis-backed versioning)
 *   - Added POST /api/auth/logout for token revocation
 */

const express = require("express");
const { ethers } = require("ethers");
const { createChallenge, consumeChallenge, createRegisterChallenge } = require("./challenge");
const { issueToken, requireAuth, revokeAllTokens } = require("./jwt");
const { challengeLimiter } = require("../security/rateLimiter");

const router = express.Router();

/**
 * GET /api/auth/register-challenge
 * Generate a nonce and metadata for canonical registration signature.
 */
router.get("/register-challenge", requireAuth, challengeLimiter, async (req, res) => {
  try {
    const challengeData = await createRegisterChallenge(req.user.sub);
    return res.json(challengeData);
  } catch (err) {
    return res.status(500).json({ error: "Challenge generation failed" });
  }
});

/**
 * POST /api/auth/challenge
 * Body: { address }
 * Generate a one-time nonce for the wallet to sign.
 */
router.post("/challenge", challengeLimiter, async (req, res) => {
  const { address } = req.body;

  if (!address || !ethers.isAddress(address)) {
    return res.status(400).json({ error: "Valid Ethereum address required" });
  }

  try {
    const challenge = await createChallenge(address);
    return res.json({ challenge });
  } catch {
    return res.status(500).json({ error: "Challenge generation failed" });
  }
});

/**
 * POST /api/auth/verify
 * Body: { address, signature }
 * Verify the wallet signed the challenge nonce. Issue JWT on success.
 */
router.post("/verify", challengeLimiter, async (req, res) => {
  const { address, signature } = req.body;

  if (!address || !signature) {
    return res.status(400).json({ error: "Address and signature required" });
  }

  try {
    const nonce = await consumeChallenge(address);

    if (!nonce) {
      return res.status(401).json({ error: "Authentication failed" });
    }

    let recovered;
    try {
      const domain = {
        name: "BlockChat",
        version: "1",
        chainId: parseInt(process.env.CHAIN_ID || "31337", 10),
        verifyingContract: "0x0000000000000000000000000000000000000000",
      };
      const types = {
        Login: [
          { name: "wallet", type: "address" },
          { name: "nonce", type: "string" },
          { name: "purpose", type: "string" },
        ],
      };
      const value = {
        wallet: address.toLowerCase(),
        nonce: nonce, // trusted from server
        purpose: "login",
      };

      recovered = ethers.verifyTypedData(domain, types, value, signature);
    } catch (err) {
      return res.status(401).json({ error: "Authentication failed" });
    }

    if (recovered.toLowerCase() !== address.toLowerCase()) {
      return res.status(401).json({ error: "Authentication failed" });
    }

    // issueToken is now async (reads version from Redis)
    const token = await issueToken(address);
    return res.json({ token });
  } catch {
    return res.status(500).json({ error: "Authentication failed" });
  }
});

/**
 * POST /api/auth/logout
 * Revoke all tokens for the authenticated wallet.
 * Increments the token version — all existing JWTs become invalid.
 */
router.post("/logout", requireAuth, async (req, res) => {
  try {
    await revokeAllTokens(req.user.sub);
    return res.json({ success: true });
  } catch {
    return res.status(500).json({ error: "Logout failed" });
  }
});

module.exports = router;
