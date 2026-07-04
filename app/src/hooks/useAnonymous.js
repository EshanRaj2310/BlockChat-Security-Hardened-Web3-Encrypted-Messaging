import { useState, useCallback } from "react";
import { ethers } from "ethers";
import {
  generateAnonymousKeyPair,
  encryptAnonymous,
  decryptAnonymous,
} from "@/crypto";

/**
 * useAnonymous — Ephemeral wallet + key generation for anonymous mode.
 *
 * CHANGES:
 * - Now imports from @/crypto (not @/utils/crypto).
 * - decryptAnonymous now requires messageNonce parameter.
 * - Keys are NEVER stored. Discarded from memory after sending.
 */
export function useAnonymous() {
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

  /**
   * Toggle anonymous mode.
   */
  const toggleAnonymous = useCallback(() => {
    setIsAnonymous((prev) => !prev);
  }, []);

  /**
   * Enable anonymous mode.
   */
  const enableAnonymous = useCallback(() => {
    setIsAnonymous(true);
  }, []);

  /**
   * Disable anonymous mode.
   */
  const disableAnonymous = useCallback(() => {
    setIsAnonymous(false);
  }, []);

  /**
   * Generate ephemeral wallet + keypair for a single anonymous message.
   * Returns ephemeral keys (caller must discard after use).
   */
  const generateEphemeralIdentity = useCallback(async () => {
    setIsGenerating(true);
    try {
      // Generate random Ethereum wallet
      const wallet = ethers.Wallet.createRandom();
      // Generate ECDH keypair
      const ecdhKeys = await generateAnonymousKeyPair();

      setIsGenerating(false);
      return {
        wallet,
        privateKey: ecdhKeys.privateKey,
        publicKeyHex: ecdhKeys.publicKeyHex,
        address: wallet.address,
      };
    } catch (err) {
      setIsGenerating(false);
      throw err;
    }
  }, []);

  /**
   * Encrypt a message anonymously.
   * Uses ephemeral keys that should be discarded after.
   */
  const sendAnonymousMessage = useCallback(
    async (ephemeralPrivKey, recipientPubKeyHex, plaintext) => {
      return encryptAnonymous(recipientPubKeyHex, plaintext);
    },
    []
  );

  /**
   * Decrypt an anonymous message (as recipient).
   * Now requires messageNonce for per-message key derivation.
   */
  const receiveAnonymousMessage = useCallback(
    async (myPrivKey, ephemeralPubBase64, ivBase64, ciphertextBase64, messageNonceBase64) => {
      return decryptAnonymous(
        myPrivKey,
        ephemeralPubBase64,
        ivBase64,
        ciphertextBase64,
        messageNonceBase64
      );
    },
    []
  );

  return {
    isAnonymous,
    isGenerating,
    toggleAnonymous,
    enableAnonymous,
    disableAnonymous,
    generateEphemeralIdentity,
    sendAnonymousMessage,
    receiveAnonymousMessage,
  };
}
