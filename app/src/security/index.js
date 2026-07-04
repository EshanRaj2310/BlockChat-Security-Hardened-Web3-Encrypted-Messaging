// ============================================================
// BlockChat Security Module — Public API
// ============================================================

export {
  sanitizeText,
  sanitizeUsername,
  sanitizeFilename,
  isValidAddress,
  isValidPublicKeyHex,
  isValidBase64,
  isValidCID,
} from "./sanitize.js";

export {
  isDuplicate,
  markSeen,
  validateTimestamp,
  validateIncomingMessage,
  validateIncomingFileMessage,
  validateSocketPayload,
} from "./messageValidation.js";

export {
  validateFile,
  validateEncryptedBlobSchema,
} from "./fileValidation.js";
