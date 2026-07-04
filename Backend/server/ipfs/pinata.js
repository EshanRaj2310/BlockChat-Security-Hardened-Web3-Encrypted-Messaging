/**
 * @file ipfs/pinata.js
 * @description IPFS upload/download with local filesystem fallback.
 *
 * Supports TWO modes:
 *   1. Pinata: real IPFS uploads (requires PINATA_API_KEY + PINATA_SECRET_KEY)
 *   2. Local:  stores blobs on disk in ./uploads/ for dev/testing
 *
 * Mode is auto-detected from env vars.
 */

const { Readable } = require("stream");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const { validateUpload, isValidCid } = require("../security/validator");

// ── Mode detection ──────────────────────────────────────────────────
const USE_PINATA = !!(process.env.PINATA_API_KEY && process.env.PINATA_SECRET_KEY);

if (!USE_PINATA) {
  console.log("[ipfs] Running in LOCAL mode (no Pinata). Files stored on disk.");
}

// ── Local storage setup ─────────────────────────────────────────────
const UPLOAD_DIR = path.resolve(__dirname, "..", "..", "uploads");
if (!USE_PINATA && !fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

let pinata = null;

function getPinata() {
  if (!pinata) {
    const pinataSDK = require("@pinata/sdk");
    pinata = new pinataSDK(process.env.PINATA_API_KEY, process.env.PINATA_SECRET_KEY);
  }
  return pinata;
}

/**
 * Generate a CIDv0-like hash for local storage.
 * Not a real CID, but matches the Qm... format the validator expects.
 */
function generateLocalCid(buffer) {
  const hash = crypto.createHash("sha256").update(buffer).digest("hex");
  // Create a Qm-prefixed string that passes CID validation (46 chars total)
  // We use base58-like chars after Qm
  const base58Chars = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  let result = "Qm";
  for (let i = 0; i < 44; i++) {
    const idx = parseInt(hash.substr((i * 2) % 60, 2), 16) % base58Chars.length;
    result += base58Chars[idx];
  }
  return result;
}

/**
 * Upload an encrypted blob.
 * @param {object} file - Multer file object
 * @returns {Promise<string>} CID (real or local)
 */
async function uploadToIPFS(file) {
  const v = validateUpload(file);
  if (!v.valid) throw new Error(v.error);

  if (USE_PINATA) {
    const stream = Readable.from(file.buffer);
    stream.path = `encrypted-${Date.now()}`;
    const result = await getPinata().pinFileToIPFS(stream, {
      pinataMetadata: { name: stream.path },
      pinataOptions: { cidVersion: 0 },
    });
    return result.IpfsHash;
  } else {
    // Local mode — save to disk
    const cid = generateLocalCid(file.buffer);
    const filePath = path.join(UPLOAD_DIR, cid);
    fs.writeFileSync(filePath, file.buffer);
    return cid;
  }
}

/**
 * Download a file by CID.
 * @param {string} cid
 * @returns {Promise<ReadableStream>} Stream of file bytes
 */
async function downloadFromIPFS(cid) {
  if (!isValidCid(cid)) throw new Error("INVALID_CID");

  if (USE_PINATA) {
    const gateway = process.env.PINATA_GATEWAY || "https://gateway.pinata.cloud";
    const url = `${gateway}/ipfs/${cid}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Gateway returned ${response.status}`);
    return response.body;
  } else {
    // Local mode — read from disk
    const filePath = path.join(UPLOAD_DIR, cid);
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${cid}`);
    }
    const buffer = fs.readFileSync(filePath);
    // Return a web-compatible ReadableStream
    const { Readable: NodeReadable } = require("stream");
    const nodeStream = NodeReadable.from(buffer);
    return nodeStream;
  }
}

module.exports = { uploadToIPFS, downloadFromIPFS };
