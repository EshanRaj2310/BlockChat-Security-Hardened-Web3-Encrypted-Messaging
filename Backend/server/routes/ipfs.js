/**
 * @file routes/ipfs.js
 * @description IPFS upload/download routes with security validation.
 *
 * SECURITY CHANGES from v1:
 *   1. Upload: validates file size AND MIME type before uploading
 *   2. Download: validates CID format before constructing gateway URL
 *   3. Per-wallet rate limiting + separate upload throttle
 *   4. Backend proxies downloads — clients never hit gateway directly
 *   5. Content treated as opaque — never logged or inspected
 */

const express = require("express");
const multer = require("multer");
const { Readable } = require("stream");
const { requireAuth } = require("../auth/jwt");
const { uploadToIPFS, downloadFromIPFS } = require("../ipfs/pinata");
const { validateUpload, isValidCid, MAX_UPLOAD_BYTES } = require("../security/validator");
const { uploadLimiter, walletRateLimiter } = require("../security/rateLimiter");

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES },
});

/**
 * POST /api/ipfs/upload
 * Upload an encrypted blob to IPFS.
 * Double rate-limited: per-IP (uploadLimiter) + per-wallet.
 */
router.post(
  "/upload",
  requireAuth,
  uploadLimiter,
  walletRateLimiter(20),
  upload.single("encryptedBlob"),
  async (req, res) => {
    // SECURITY: validate file before uploading
    const v = validateUpload(req.file);
    if (!v.valid) {
      return res.status(400).json({ error: v.error });
    }

    try {
      const cid = await uploadToIPFS(req.file);
      return res.json({ cid });
    } catch (err) {
      // SECURITY: generic error — don't expose Pinata internals
      console.error("[ipfs] upload failed:", err.code || "UNKNOWN");
      return res.status(500).json({ error: "Upload failed" });
    }
  }
);

/**
 * GET /api/ipfs/:cid
 * Proxy download from Pinata gateway.
 */
router.get("/:cid", requireAuth, walletRateLimiter(), async (req, res) => {
  const { cid } = req.params;

  // SECURITY: validate CID format before constructing gateway URL
  if (!isValidCid(cid)) {
    return res.status(400).json({ error: "Invalid CID" });
  }

  try {
    const stream = await downloadFromIPFS(cid);
    res.set("Content-Type", "application/octet-stream");
    res.set("Cache-Control", "private, no-store");

    // Handle both web streams (Pinata) and node streams (local fallback)
    if (stream.pipe && typeof stream.pipe === "function") {
      // Already a Node readable stream
      stream.pipe(res);
    } else {
      // Web ReadableStream — convert to Node stream
      const nodeStream = Readable.fromWeb(stream);
      nodeStream.pipe(res);
    }
  } catch (err) {
    console.error("[ipfs] download failed:", err.message || err.code || "UNKNOWN");
    return res.status(502).json({ error: "Download failed" });
  }
});

module.exports = router;
