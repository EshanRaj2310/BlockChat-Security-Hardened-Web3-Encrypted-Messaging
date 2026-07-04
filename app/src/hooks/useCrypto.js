import { useState, useCallback, useEffect, useRef } from "react";
import {
  generateAndStoreIdentity,
  unlockIdentity,
  lockIdentity,
  resetActivityTimer,
  isUnlocked,
  getPublicKeyHex,
  hasStoredIdentity,
  getPrivateKey,
  encryptForRecipient,
  encryptFileForRecipient,
  decryptFromSender,
  decryptFileFromSender,
  generateAnonymousKeyPair,
  encryptAnonymous,
  decryptAnonymous,
  generateGroupKey,
  wrapGroupKeyForMember,
  unwrapGroupKey,
  encryptGroupMessage,
  decryptGroupMessage,
} from "@/crypto";

/**
 * useCrypto — Manages all cryptographic operations.
 *
 * CHANGES:
 * - Keys are now passphrase-protected in IndexedDB (not raw).
 * - Auto-lock after inactivity.
 * - Per-message key derivation via HKDF.
 * - Activity tracking resets lock timer.
 */
export function useCrypto() {
  const [isReady, setIsReady] = useState(false);
  const [isLocked, setIsLocked] = useState(true);
  const [publicKeyHex, setPublicKeyHex] = useState(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [needsPassphrase, setNeedsPassphrase] = useState(false);
  const [needsSetup, setNeedsSetup] = useState(false);

  /**
   * Check if an identity exists. If so, we need passphrase to unlock.
   * If not, we need to generate one.
   */
  const checkIdentity = useCallback(async () => {
    try {
      const exists = await hasStoredIdentity();
      if (exists) {
        setNeedsPassphrase(true);
        setNeedsSetup(false);
        setPublicKeyHex(null); // Will be set after unlock
      } else {
        setNeedsSetup(true);
        setNeedsPassphrase(false);
      }
    } catch (err) {
      console.error("Crypto identity check failed:", err);
    }
  }, []);

  /**
   * Generate a new identity with passphrase protection.
   */
  const setupIdentity = useCallback(async (passphrase) => {
    setIsGenerating(true);
    try {
      const { publicKeyHex: pubHex } = await generateAndStoreIdentity(passphrase);
      setPublicKeyHex(pubHex);
      setIsReady(true);
      setIsLocked(false);
      setNeedsSetup(false);
      setNeedsPassphrase(false);
    } catch (err) {
      console.error("Identity generation failed:", err);
      throw err;
    } finally {
      setIsGenerating(false);
    }
  }, []);

  /**
   * Unlock existing identity with passphrase.
   */
  const unlock = useCallback(async (passphrase) => {
    try {
      const { publicKeyHex: pubHex } = await unlockIdentity(passphrase);
      setPublicKeyHex(pubHex);
      setIsReady(true);
      setIsLocked(false);
      setNeedsPassphrase(false);
    } catch (err) {
      console.error("Unlock failed:", err);
      throw err; // Let UI show error
    }
  }, []);

  /**
   * Lock identity — clear private key from memory.
   */
  const lock = useCallback(() => {
    lockIdentity();
    setIsLocked(true);
    setIsReady(false);
    setNeedsPassphrase(true);
  }, []);

  /**
   * Track user activity to reset auto-lock timer.
   */
  useEffect(() => {
    const handleActivity = () => {
      if (isUnlocked()) {
        resetActivityTimer();
      }
    };
    // Debounced activity tracking
    let timeout;
    const debounced = () => {
      clearTimeout(timeout);
      timeout = setTimeout(handleActivity, 1000);
    };
    window.addEventListener("keydown", debounced);
    window.addEventListener("mousemove", debounced);
    window.addEventListener("click", debounced);
    return () => {
      window.removeEventListener("keydown", debounced);
      window.removeEventListener("mousemove", debounced);
      window.removeEventListener("click", debounced);
      clearTimeout(timeout);
    };
  }, []);

  /**
   * Poll lock state (catches auto-lock from keyStorage module).
   */
  useEffect(() => {
    const interval = setInterval(() => {
      if (!isUnlocked() && !isLocked) {
        setIsLocked(true);
        setIsReady(false);
        setNeedsPassphrase(true);
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [isLocked]);

  /**
   * Check identity on mount.
   */
  useEffect(() => {
    checkIdentity();
  }, [checkIdentity]);

  // ---- Crypto operations (delegate to @/crypto) ----

  const encryptMessage = useCallback(
    async (recipientPubKeyHex, plaintext) => {
      if (!recipientPubKeyHex) throw new Error("Recipient public key required");
      return encryptForRecipient(recipientPubKeyHex, plaintext);
    },
    []
  );

  const encryptFile = useCallback(
    async (recipientPubKeyHex, fileData) => {
      if (!recipientPubKeyHex) throw new Error("Recipient public key required");
      return encryptFileForRecipient(recipientPubKeyHex, fileData);
    },
    []
  );

  const decryptMessage = useCallback(
    async (ephemeralPubBase64, ivBase64, ciphertextBase64, messageNonceBase64) => {
      return decryptFromSender(ephemeralPubBase64, ivBase64, ciphertextBase64, messageNonceBase64);
    },
    []
  );

  const decryptFile = useCallback(
    async (ephemeralPubBase64, ivBase64, ciphertextBase64, messageNonceBase64) => {
      return decryptFileFromSender(ephemeralPubBase64, ivBase64, ciphertextBase64, messageNonceBase64);
    },
    []
  );

  const generateAnonymousKeys = useCallback(async () => {
    return generateAnonymousKeyPair();
  }, []);

  const encryptAnonymousMessage = useCallback(
    async (recipientPubKeyHex, plaintext) => {
      return encryptAnonymous(recipientPubKeyHex, plaintext);
    },
    []
  );

  const decryptAnonymousMessage = useCallback(
    async (anonPrivKey, ephemeralPubBase64, ivBase64, ciphertextBase64, messageNonceBase64) => {
      return decryptAnonymous(anonPrivKey, ephemeralPubBase64, ivBase64, ciphertextBase64, messageNonceBase64);
    },
    []
  );

  const createGroupKey = useCallback(async () => {
    return generateGroupKey();
  }, []);

  const wrapKeyForMember = useCallback(
    async (groupKey, memberPubKeyHex) => {
      return wrapGroupKeyForMember(groupKey, memberPubKeyHex);
    },
    []
  );

  const unwrapKey = useCallback(async (wrappedKeyJson) => {
    const privateKey = getPrivateKey();
    return unwrapGroupKey(wrappedKeyJson, privateKey);
  }, []);

  const encryptGroupMsg = useCallback(async (groupKey, plaintext) => {
    return encryptGroupMessage(groupKey, plaintext);
  }, []);

  const decryptGroupMsg = useCallback(async (groupKey, ivBase64, ciphertextBase64, messageNonceBase64) => {
    return decryptGroupMessage(groupKey, ivBase64, ciphertextBase64, messageNonceBase64);
  }, []);

  return {
    isReady,
    isLocked,
    isGenerating,
    needsPassphrase,
    needsSetup,
    publicKeyHex,
    setupIdentity,
    unlock,
    lock,
    encryptMessage,
    encryptFile,
    decryptMessage,
    decryptFile,
    generateAnonymousKeys,
    encryptAnonymousMessage,
    decryptAnonymousMessage,
    createGroupKey,
    wrapKeyForMember,
    unwrapKey,
    encryptGroupMsg,
    decryptGroupMsg,
  };
}
