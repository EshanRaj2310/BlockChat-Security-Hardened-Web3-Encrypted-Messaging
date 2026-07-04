/**
 * @file routes/groups.js
 * @description Group management routes with on-chain verification.
 *
 * SECURITY CHANGES from v1:
 *   1. Anonymized error logging — no addresses in logs
 *   2. Per-wallet rate limiting on all endpoints
 *   3. Generic error messages
 */

const express = require("express");
const { ethers } = require("ethers");
const { requireAuth } = require("../auth/jwt");
const { getGroupManager } = require("../blockchain/contracts");
const { verifyTransaction, extractGroupIdFromReceipt } = require("../blockchain/verify");
const { walletRateLimiter } = require("../security/rateLimiter");

const router = express.Router();

router.get("/:groupId", requireAuth, walletRateLimiter(), async (req, res) => {
  try {
    const gm = getGroupManager();
    const [name, members, admin] = await gm.getGroupInfo(req.params.groupId);

    // SECURITY: only group members can see the full member list.
    // Without this, any authenticated user can enumerate group membership.
    const caller = req.user.sub.toLowerCase();
    const isMember = members.some(m => m.toLowerCase() === caller);
    if (!isMember) {
      return res.status(403).json({ error: "Forbidden" });
    }

    let wrappedKey = null;
    try {
      const kb = await gm.getWrappedKey(req.params.groupId, req.user.sub);
      wrappedKey = Buffer.from(ethers.getBytes(kb)).toString("base64");
    } catch { /* caller may not have a key yet */ }
    return res.json({ groupId: req.params.groupId, name, members, admin, wrappedKey });
  } catch (err) {
    if (err.message?.includes("GroupNotFound")) {
      return res.status(404).json({ error: "Not found" });
    }
    console.error("[groups] lookup failed:", err.code || "UNKNOWN");
    return res.status(500).json({ error: "Lookup failed" });
  }
});

router.post("/create", requireAuth, walletRateLimiter(), async (req, res) => {
  const { txHash } = req.body;
  if (!txHash) return res.status(400).json({ error: "txHash required" });

  try {
    const result = await verifyTransaction(txHash, req.user.sub, process.env.GROUP_MANAGER_ADDRESS);
    if (!result.valid) return res.status(400).json({ error: "Verification failed" });
    const gm = getGroupManager();
    const groupId = extractGroupIdFromReceipt(result.receipt, gm.interface);
    return res.json({ groupId, success: true });
  } catch {
    return res.status(500).json({ error: "Verification failed" });
  }
});

router.post("/:groupId/add", requireAuth, walletRateLimiter(), async (req, res) => {
  const { address, txHash } = req.body;
  if (!address || !txHash) return res.status(400).json({ error: "Address and txHash required" });

  try {
    const result = await verifyTransaction(txHash, req.user.sub, process.env.GROUP_MANAGER_ADDRESS);
    if (!result.valid) return res.status(400).json({ error: "Verification failed" });
    return res.json({ success: true });
  } catch {
    return res.status(500).json({ error: "Verification failed" });
  }
});

router.post("/:groupId/remove", requireAuth, walletRateLimiter(), async (req, res) => {
  const { address, txHash } = req.body;
  if (!address || !txHash) return res.status(400).json({ error: "Address and txHash required" });

  try {
    const result = await verifyTransaction(txHash, req.user.sub, process.env.GROUP_MANAGER_ADDRESS);
    if (!result.valid) return res.status(400).json({ error: "Verification failed" });
    return res.json({ success: true });
  } catch {
    return res.status(500).json({ error: "Verification failed" });
  }
});

module.exports = router;
