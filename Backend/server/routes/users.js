/**
 * @file routes/users.js
 * @description User identity routes.
 *
 * Supports TWO modes:
 *   1. On-chain: reads from IdentityRegistry (requires SEPOLIA_RPC_URL + IDENTITY_REGISTRY_ADDRESS)
 *   2. Local:    in-memory store for dev/testing (no blockchain needed)
 *
 * The mode is auto-detected: if IDENTITY_REGISTRY_ADDRESS is not set,
 * the server runs in local mode and stores/retrieves user data in memory.
 */

const express = require("express");
const { ethers } = require("ethers");
const { requireAuth } = require("../auth/jwt");
const { walletRateLimiter } = require("../security/rateLimiter");

const router = express.Router();

// ── Local User Store (dev mode) ─────────────────────────────────────
// address (lowercase) → { address, username, publicKey, profileCid }
const localUsers = new Map();

const USE_BLOCKCHAIN = !!(process.env.IDENTITY_REGISTRY_ADDRESS && process.env.SEPOLIA_RPC_URL);

if (!USE_BLOCKCHAIN) {
  console.log("[users] Running in LOCAL mode (no blockchain). Users stored in memory.");
}

/**
 * GET /api/users/:address
 * Fetch user identity — on-chain or local store.
 */
router.get("/:address", requireAuth, walletRateLimiter(), async (req, res) => {
  const { address } = req.params;

  if (!ethers.isAddress(address)) {
    return res.status(400).json({ error: "Invalid address" });
  }

  if (USE_BLOCKCHAIN) {
    try {
      const { getIdentityRegistry } = require("../blockchain/contracts");
      const registry = getIdentityRegistry();
      const [publicKey, username, profileCid] = await registry.getKey(address);
      return res.json({
        address,
        username,
        publicKey: ethers.hexlify(publicKey),
        profileCid,
      });
    } catch (err) {
      if (err.message?.includes("NotRegistered")) {
        return res.status(404).json({ error: "Not registered" });
      }
      console.error("[users] identity lookup failed:", err.code || "UNKNOWN");
      return res.status(500).json({ error: "Lookup failed" });
    }
  } else {
    // Local mode
    const user = localUsers.get(address.toLowerCase());
    if (!user) {
      return res.status(404).json({ error: "Not registered" });
    }
    return res.json(user);
  }
});

const { consumeRegisterChallenge } = require("../auth/challenge");

/**
 * Helper: canonicalize public key (strip 0x, fixed length, re-add 0x).
 */
function canonicalizePublicKey(hex) {
  if (!hex || typeof hex !== "string") return null;
  let clean = hex.toLowerCase().replace(/^0x/, "");
  // Uncompressed P-256 public key is 65 bytes -> 130 hex characters
  if (clean.length !== 130) return null;
  return `0x${clean}`;
}



/**
 * POST /api/users/register
 * Register a user — hardened with nonces, canonical payload signing, and idempotency.
 */
router.post("/register", requireAuth, walletRateLimiter(), async (req, res) => {
  let { address, username, publicKey, txHash, signature, nonce } = req.body;

  if (!address || !publicKey || !signature || !nonce) {
    return res.status(400).json({ error: "Invalid request" });
  }

  // 1. JWT BINDING
  if (req.user.sub.toLowerCase() !== address.toLowerCase()) {
    return res.status(403).json({ error: "Invalid request" });
  }

  // 2. CANONICALIZATION
  address = address.toLowerCase();
  publicKey = canonicalizePublicKey(publicKey);
  if (!publicKey) {
    return res.status(400).json({ error: "Invalid request" });
  }

  // 3. NONCE + EXPIRY VERIFICATION
  const challengeData = await consumeRegisterChallenge(address);
  if (!challengeData) {
    return res.status(401).json({ error: "Invalid request" });
  }

  if (challengeData.nonce !== nonce) {
    return res.status(401).json({ error: "Invalid request" });
  }
  
  // Allow 30s clock skew
  if (Date.now() > challengeData.expiresAt + 30000) {
    return res.status(401).json({ error: "Invalid request" });
  }

  // 4. SIGNING PAYLOAD (EIP-712 DOMAIN SEPARATION)
  try {
    const domain = {
      name: "BlockChat",
      version: "1",
      chainId: parseInt(process.env.CHAIN_ID || "31337", 10),
      verifyingContract: "0x0000000000000000000000000000000000000000",
    };
    const types = {
      Registration: [
        { name: "wallet", type: "address" },
        { name: "publicKey", type: "string" },
        { name: "nonce", type: "string" },
        { name: "issuedAt", type: "uint256" },
        { name: "expiresAt", type: "uint256" },
        { name: "purpose", type: "string" },
      ],
    };
    
    // STRICT VALIDATION: Reconstruct value using ONLY trusted data + canonicalized inputs
    const value = {
      wallet: address.toLowerCase(),
      publicKey: publicKey, // already canonicalized 0x... hex
      nonce: String(challengeData.nonce),
      issuedAt: Number(challengeData.issuedAt),
      expiresAt: Number(challengeData.expiresAt),
      purpose: "registration",
    };

    const recoveredAddress = ethers.verifyTypedData(domain, types, value, signature);
    if (recoveredAddress.toLowerCase() !== address.toLowerCase()) {
      return res.status(401).json({ error: "Invalid request" });
    }
  } catch (err) {
    return res.status(401).json({ error: "Invalid request" });
  }

  // 5. IDEMPOTENCY & ON-CHAIN/LOCAL STORAGE
  if (USE_BLOCKCHAIN) {
    if (!txHash) {
      return res.status(400).json({ error: "txHash required for on-chain registration" });
    }
    try {
      const { verifyTransaction } = require("../blockchain/verify");
      const result = await verifyTransaction(txHash, address, process.env.IDENTITY_REGISTRY_ADDRESS);
      if (!result.valid) {
        return res.status(400).json({ error: "Verification failed" });
      }
      return res.json({ success: true, updatedAt: Date.now() });
    } catch {
      return res.status(500).json({ error: "Verification failed" });
    }
  } else {
    // Local mode — store directly
    const existing = localUsers.get(address);
    localUsers.set(address, {
      address,
      username: username || (existing ? existing.username : address.slice(0, 8)),
      publicKey,
      profileCid: existing ? existing.profileCid : "",
      updatedAt: Date.now(),
      version: existing ? (existing.version || 1) + 1 : 1
    });
    return res.json({ success: true, updatedAt: Date.now() });
  }
});

module.exports = router;
