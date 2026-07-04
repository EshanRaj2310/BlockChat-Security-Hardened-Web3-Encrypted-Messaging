// ============================================================
// BlockChat Crypto Utilities — BACKWARD COMPATIBILITY SHIM
// ============================================================
// This file re-exports from the new @/crypto module.
// All new code should import from @/crypto directly.
//
// This shim exists so that any remaining imports from
// "@/utils/crypto" continue to work during the migration.
// ============================================================

// Re-export everything from the new crypto module
export {
  // Key storage (new API — old storeIdentity/getIdentity removed)
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

  // Encryption
  encryptForRecipient,
  decryptFromSender,
  decryptFileFromSender,
  importPublicKey,
  generateAnonymousKeyPair,
  encryptAnonymous,
  decryptAnonymous,

  // Group encryption
  generateGroupKey,
  importGroupKey,
  wrapGroupKeyForMember,
  unwrapGroupKey,
  encryptGroupMessage,
  decryptGroupMessage,

  // Encoding helpers
  arrayBufferToBase64,
  base64ToArrayBuffer,
  arrayBufferToHex,
  hexToArrayBuffer,
} from "@/crypto";

// ============================================================
// DEPRECATED EXPORTS — for backward compatibility only
// These functions have different signatures in the new module.
// ============================================================

/**
 * @deprecated Use generateAndStoreIdentity(passphrase) instead.
 */
export async function generateECDHKeyPair() {
  console.warn(
    "[DEPRECATED] generateECDHKeyPair() — use generateAndStoreIdentity(passphrase) from @/crypto"
  );
  throw new Error(
    "generateECDHKeyPair is no longer supported. Use generateAndStoreIdentity(passphrase)."
  );
}

/**
 * @deprecated Use unlockIdentity(passphrase) + getPrivateKey() instead.
 */
export async function getIdentity() {
  console.warn(
    "[DEPRECATED] getIdentity() — use unlockIdentity(passphrase) + getPublicKeyHex() from @/crypto"
  );
  throw new Error(
    "getIdentity is no longer supported. Use unlockIdentity(passphrase)."
  );
}

/**
 * @deprecated Use storeIdentity is no longer needed — keys are stored encrypted.
 */
export async function storeIdentity() {
  console.warn(
    "[DEPRECATED] storeIdentity() — keys are now automatically stored encrypted via generateAndStoreIdentity()"
  );
  throw new Error(
    "storeIdentity is no longer supported."
  );
}

/**
 * @deprecated Use deriveAESKeyWithHKDF from @/crypto/keyDerivation instead.
 */
export async function deriveSharedAESKey() {
  console.warn(
    "[DEPRECATED] deriveSharedAESKey() — use deriveAESKeyWithHKDF() or derivePerMessageKey() from @/crypto/keyDerivation"
  );
  throw new Error(
    "deriveSharedAESKey is no longer supported. Use HKDF-based derivation."
  );
}
