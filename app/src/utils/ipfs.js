// ============================================================
// BlockChat IPFS Upload/Download Helpers
// ============================================================
// Backend: POST /api/ipfs/upload  → { cid }
//          GET  /api/ipfs/:cid    → encrypted blob
// ============================================================
// CHANGES:
// - CID format validation before download (fixes F4)
// - Encrypted blob schema validation (fixes F2)
// - File validation uses security module (fixes F1)
// ============================================================

import axios from "axios";
import { isValidCID, validateEncryptedBlobSchema, sanitizeFilename } from "@/security";

const API_BASE = "http://localhost:5000/api";

/**
 * Upload an encrypted blob to IPFS via the backend.
 * @param {Blob|File} encryptedBlob
 * @param {string} [authToken] — JWT for authenticated uploads
 * @param {Function} [onProgress] — Progress callback (0-100)
 * @returns {Promise<string>} CID
 */
export async function uploadToIPFS(encryptedBlob, authToken, onProgress) {
  const formData = new FormData();
  formData.append("encryptedBlob", encryptedBlob);

  const headers = {};
  if (authToken) {
    headers["Authorization"] = `Bearer ${authToken}`;
  }

  const res = await axios.post(`${API_BASE}/ipfs/upload`, formData, {
    headers,
    onUploadProgress: (progressEvent) => {
      if (progressEvent.total && onProgress) {
        const percent = Math.round(
          (progressEvent.loaded * 100) / progressEvent.total
        );
        onProgress(percent);
      }
    },
  });
  return res.data.cid;
}

/**
 * Download an encrypted blob from IPFS via the backend.
 *
 * FIX F4: Validates CID format before interpolating into URL.
 *
 * @param {string} cid
 * @param {string} [authToken] — JWT for authenticated downloads
 * @returns {Promise<ArrayBuffer>}
 */
export async function downloadFromIPFS(cid, authToken) {
  // Validate CID format to prevent path traversal
  if (!isValidCID(cid)) {
    throw new Error(`Invalid CID format: ${String(cid).slice(0, 20)}...`);
  }

  const headers = {};
  if (authToken) {
    headers["Authorization"] = `Bearer ${authToken}`;
  }

  const res = await axios.get(`${API_BASE}/ipfs/${encodeURIComponent(cid)}`, {
    responseType: "arraybuffer",
    headers,
  });
  return res.data;
}

/**
 * Build an encrypted JSON blob for upload.
 * @param {Object} payload — { iv, ciphertext, type, filename?, mime?, messageNonce? }
 * @returns {Blob}
 */
export function buildEncryptedBlob(payload) {
  // Sanitize filename if present
  const sanitized = {
    ...payload,
    filename: payload.filename ? sanitizeFilename(payload.filename) : undefined,
  };
  const json = JSON.stringify(sanitized);
  return new Blob([json], { type: "application/octet-stream" });
}

/**
 * Parse an encrypted blob downloaded from IPFS.
 *
 * FIX F2: Validates schema before returning.
 *
 * @param {ArrayBuffer} buffer
 * @returns {Object} — { iv, ciphertext, type, filename?, mime?, messageNonce? }
 */
export async function parseEncryptedBlob(buffer) {
  let parsed;
  try {
    const text = new TextDecoder().decode(buffer);
    parsed = JSON.parse(text);
  } catch {
    throw new Error("Failed to parse encrypted blob: invalid JSON");
  }

  // Schema validation
  const validation = validateEncryptedBlobSchema(parsed);
  if (!validation.valid) {
    throw new Error(`Invalid encrypted blob: ${validation.error}`);
  }

  // Sanitize filename if present
  if (parsed.filename) {
    parsed.filename = sanitizeFilename(parsed.filename);
  }

  return parsed;
}

/**
 * Read a file as ArrayBuffer.
 */
export function readFileAsArrayBuffer(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(file);
  });
}

/**
 * Read a file as DataURL (for previews).
 */
export function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/**
 * Create an object URL from decrypted ArrayBuffer for inline display.
 */
export function createObjectURLFromBuffer(buffer, mimeType) {
  const blob = new Blob([buffer], { type: mimeType });
  return URL.createObjectURL(blob);
}

/**
 * Format file size for display.
 */
export function formatFileSize(bytes) {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

/**
 * Determine message type from MIME type.
 */
export function getMessageTypeFromMime(mime) {
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  return "file";
}
