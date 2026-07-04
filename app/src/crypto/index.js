// ============================================================
// BlockChat Crypto Module — Public API
// ============================================================
// Single entry point for all crypto operations.
// UI should ONLY import from this index.
// ============================================================

// Key storage
export {
  generateAndStoreIdentity,
  unlockIdentity,
  lockIdentity,
  resetActivityTimer,
  isUnlocked,
  getPrivateKey,
  getPublicKeyHex,
  hasStoredIdentity,
  getStoredIdentity,
  deleteIdentity,
} from "./keyStorage.js";

// Encryption / decryption
export {
  encryptForRecipient,
  encryptFileForRecipient,
  decryptFromSender,
  decryptFileFromSender,
  importPublicKey,
  generateAnonymousKeyPair,
  encryptAnonymous,
  decryptAnonymous,
} from "./encryption.js";

// Group encryption
export {
  generateGroupKey,
  importGroupKey,
  wrapGroupKeyForMember,
  unwrapGroupKey,
  encryptGroupMessage,
  decryptGroupMessage,
} from "./groupEncryption.js";

// Encoding helpers
export {
  arrayBufferToBase64,
  base64ToArrayBuffer,
  arrayBufferToHex,
  hexToArrayBuffer,
} from "./encoding.js";

// Key derivation (advanced — normally not needed by UI)
export {
  deriveWrappingKey,
  wrapKeyWithPassphrase,
  unwrapKeyWithPassphrase,
} from "./keyDerivation.js";
