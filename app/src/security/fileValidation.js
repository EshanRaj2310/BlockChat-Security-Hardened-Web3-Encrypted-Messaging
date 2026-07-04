// ============================================================
// BlockChat File Validation — Magic numbers + size limits
// ============================================================
// Fixes: F1 (size-only validation), F2 (no schema validation)
// ============================================================

/**
 * Known file type magic numbers (first few bytes).
 */
const MAGIC_NUMBERS = {
  // Images
  "image/jpeg": [[0xFF, 0xD8, 0xFF]],
  "image/png": [[0x89, 0x50, 0x4E, 0x47]],
  "image/gif": [[0x47, 0x49, 0x46, 0x38]],
  "image/webp": [[0x52, 0x49, 0x46, 0x46]], // RIFF header
  "image/bmp": [[0x42, 0x4D]],
  // Video
  "video/mp4": [[0x00, 0x00, 0x00], [0x66, 0x74, 0x79, 0x70]], // ftyp at offset 4
  "video/webm": [[0x1A, 0x45, 0xDF, 0xA3]],
  // Audio
  "audio/mpeg": [[0xFF, 0xFB], [0xFF, 0xF3], [0xFF, 0xF2], [0x49, 0x44, 0x33]],
  "audio/ogg": [[0x4F, 0x67, 0x67, 0x53]],
  "audio/webm": [[0x1A, 0x45, 0xDF, 0xA3]],
  "audio/wav": [[0x52, 0x49, 0x46, 0x46]],
  // Documents
  "application/pdf": [[0x25, 0x50, 0x44, 0x46]],
  "application/zip": [[0x50, 0x4B, 0x03, 0x04]],
};

/**
 * Allowed MIME types for upload.
 */
const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg", "image/png", "image/gif", "image/webp", "image/bmp",
  "video/mp4", "video/webm", "video/quicktime",
  "audio/mpeg", "audio/ogg", "audio/webm", "audio/wav", "audio/aac",
  "application/pdf", "application/zip", "application/x-zip-compressed",
  "text/plain", "text/csv", "text/markdown",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/rtf",
  "application/octet-stream",
]);

const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB

/**
 * Validate a file before upload.
 * Checks: size, MIME type allowlist, and magic number match.
 *
 * @param {File} file
 * @returns {Promise<{ valid: boolean, error?: string }>}
 */
export async function validateFile(file) {
  if (!file || !(file instanceof File || file instanceof Blob)) {
    return { valid: false, error: "Invalid file object" };
  }

  // Size check
  if (file.size > MAX_FILE_SIZE) {
    return { valid: false, error: `File too large. Max size is 100MB.` };
  }

  if (file.size === 0) {
    return { valid: false, error: "File is empty" };
  }

  // MIME type allowlist
  if (!ALLOWED_MIME_TYPES.has(file.type) && file.type !== "") {
    return { valid: false, error: `File type '${file.type}' is not allowed` };
  }

  // Magic number validation
  const magicValid = await validateMagicNumber(file);
  if (!magicValid.valid) {
    return magicValid;
  }

  return { valid: true };
}

/**
 * Validate a file's magic number against its claimed MIME type.
 *
 * @param {File|Blob} file
 * @returns {Promise<{ valid: boolean, error?: string }>}
 */
async function validateMagicNumber(file) {
  try {
    // Read first 12 bytes
    const header = await readFileHeader(file, 12);
    if (header.length === 0) {
      return { valid: false, error: "Cannot read file header" };
    }

    // If we have a known magic number for this type, verify it
    const expectedMagics = MAGIC_NUMBERS[file.type];
    if (expectedMagics) {
      const matches = expectedMagics.some((magic) =>
        magic.every((byte, i) => header[i] === byte)
      );
      if (!matches) {
        return {
          valid: false,
          error: `File content doesn't match claimed type '${file.type}'`,
        };
      }
    }

    return { valid: true };
  } catch {
    // If we can't read the header, allow but log
    console.warn("Could not validate file magic number");
    return { valid: true };
  }
}

/**
 * Read the first N bytes of a file.
 */
function readFileHeader(file, bytes) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      resolve(new Uint8Array(reader.result));
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(file.slice(0, bytes));
  });
}

/**
 * Validate an encrypted blob schema downloaded from IPFS.
 *
 * @param {object} parsed
 * @returns {{ valid: boolean, error?: string }}
 */
export function validateEncryptedBlobSchema(parsed) {
  if (!parsed || typeof parsed !== "object") {
    return { valid: false, error: "Invalid encrypted blob: not an object" };
  }

  // Required fields
  if (typeof parsed.iv !== "string" || parsed.iv.length === 0) {
    return { valid: false, error: "Missing or invalid 'iv' field" };
  }
  if (typeof parsed.ciphertext !== "string" || parsed.ciphertext.length === 0) {
    return { valid: false, error: "Missing or invalid 'ciphertext' field" };
  }

  // Optional fields — validate types if present
  if (parsed.type !== undefined && typeof parsed.type !== "string") {
    return { valid: false, error: "Invalid 'type' field" };
  }
  if (parsed.filename !== undefined && typeof parsed.filename !== "string") {
    return { valid: false, error: "Invalid 'filename' field" };
  }
  if (parsed.mime !== undefined && typeof parsed.mime !== "string") {
    return { valid: false, error: "Invalid 'mime' field" };
  }

  return { valid: true };
}
