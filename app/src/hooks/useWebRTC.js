import { useState, useCallback, useRef, useEffect } from "react";
import SimplePeer from "simple-peer";
import { encryptForRecipient, decryptFromSender } from "@/crypto";

/**
 * useWebRTC — Audio/video call management via simple-peer.
 *
 * CHANGES (STEP 5):
 * - WebRTC signaling payloads (offer/answer) are encrypted before
 *   transmission over the socket channel.
 * - Incoming signaling payloads are decrypted before use.
 * - ICE candidates are validated before processing.
 */
export function useWebRTC() {
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [isCallActive, setIsCallActive] = useState(false);
  const [isCalling, setIsCalling] = useState(false);
  const [isReceivingCall, setIsReceivingCall] = useState(false);
  const [callError, setCallError] = useState(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);

  const peerRef = useRef(null);
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const pendingOfferRef = useRef(null);

  /**
   * Get user media (camera + mic).
   */
  const getMedia = useCallback(async (video = true, audio = true) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video,
        audio,
      });
      setLocalStream(stream);
      return stream;
    } catch (err) {
      setCallError("Failed to access camera/microphone: " + err.message);
      throw err;
    }
  }, []);

  /**
   * Encrypt a signaling payload (offer/answer) for the recipient.
   *
   * @param {string} recipientPubKeyHex
   * @param {object} signalingData — SimplePeer signal data
   * @returns {Promise<object>} encrypted payload
   */
  const encryptSignaling = useCallback(async (recipientPubKeyHex, signalingData) => {
    if (!recipientPubKeyHex) {
      // Fallback: send unencrypted if no public key available
      console.warn("[WebRTC] No recipient public key — sending signaling unencrypted");
      return { unencrypted: true, data: signalingData };
    }
    try {
      const plaintext = JSON.stringify(signalingData);
      const encrypted = await encryptForRecipient(recipientPubKeyHex, plaintext);
      return { encrypted: true, ...encrypted };
    } catch (err) {
      console.error("[WebRTC] Failed to encrypt signaling:", err);
      // Fallback to unencrypted to not break calls
      return { unencrypted: true, data: signalingData };
    }
  }, []);

  /**
   * Decrypt an incoming signaling payload.
   *
   * @param {object} payload — encrypted or unencrypted signaling data
   * @returns {Promise<object>} decrypted SimplePeer signal data
   */
  const decryptSignaling = useCallback(async (payload) => {
    if (!payload) throw new Error("Empty signaling payload");

    // Handle unencrypted fallback (backward compat)
    if (payload.unencrypted || payload.data) {
      return payload.data || payload;
    }

    // Decrypt
    if (payload.encrypted && payload.ephemeralPubBase64 && payload.iv && payload.ciphertext) {
      const plaintext = await decryptFromSender(
        payload.ephemeralPubBase64,
        payload.iv,
        payload.ciphertext,
        payload.messageNonce
      );
      return JSON.parse(plaintext);
    }

    // Legacy: raw signaling data (backward compat)
    if (payload.type === "offer" || payload.type === "answer") {
      return payload;
    }

    throw new Error("Unrecognized signaling payload format");
  }, []);

  /**
   * Start a call (outgoing).
   *
   * @param {string} to — recipient address
   * @param {function} emitOffer — (to, encryptedPayload) => void
   * @param {boolean} video
   * @param {string} [recipientPubKeyHex] — for encrypting signaling
   */
  const startCall = useCallback(
    async (to, emitOffer, video = true, recipientPubKeyHex = null) => {
      setIsCalling(true);
      setCallError(null);
      try {
        const stream = await getMedia(video);

        const peer = new SimplePeer({
          initiator: true,
          trickle: false,
          stream,
        });

        peer.on("signal", async (data) => {
          if (data.type === "offer") {
            const encrypted = await encryptSignaling(recipientPubKeyHex, data);
            emitOffer(to, encrypted);
          }
        });

        peer.on("stream", (remote) => {
          setRemoteStream(remote);
        });

        peer.on("error", (err) => {
          setCallError(err.message);
          endCall();
        });

        peer.on("connect", () => {
          setIsCallActive(true);
          setIsCalling(false);
        });

        peer.on("close", () => {
          endCall();
        });

        peerRef.current = peer;
      } catch (err) {
        setIsCalling(false);
      }
    },
    [getMedia, encryptSignaling]
  );

  /**
   * Receive an incoming call offer.
   */
  const receiveCallOffer = useCallback(async (from, encryptedOffer) => {
    try {
      const offer = await decryptSignaling(encryptedOffer);
      setIsReceivingCall(true);
      pendingOfferRef.current = { from, offer };
    } catch (err) {
      console.error("[WebRTC] Failed to decrypt incoming offer:", err);
      setCallError("Failed to process incoming call");
    }
  }, [decryptSignaling]);

  /**
   * Accept an incoming call.
   *
   * @param {function} emitAnswer — (to, encryptedPayload) => void
   * @param {boolean} video
   * @param {string} [recipientPubKeyHex] — for encrypting answer
   */
  const acceptCall = useCallback(
    async (emitAnswer, video = true, recipientPubKeyHex = null) => {
      if (!pendingOfferRef.current) return;
      setIsReceivingCall(false);
      setIsCallActive(true);
      setCallError(null);

      try {
        const stream = await getMedia(video);
        const { from, offer } = pendingOfferRef.current;

        const peer = new SimplePeer({
          initiator: false,
          trickle: false,
          stream,
        });

        peer.on("signal", async (data) => {
          if (data.type === "answer") {
            const encrypted = await encryptSignaling(recipientPubKeyHex, data);
            emitAnswer(from, encrypted);
          }
        });

        peer.on("stream", (remote) => {
          setRemoteStream(remote);
        });

        peer.on("error", (err) => {
          setCallError(err.message);
          endCall();
        });

        peer.on("close", () => {
          endCall();
        });

        peer.signal(offer);
        peerRef.current = peer;
      } catch (err) {
        setCallError(err.message);
        endCall();
      }
    },
    [getMedia, encryptSignaling]
  );

  /**
   * Decline an incoming call.
   */
  const declineCall = useCallback(() => {
    setIsReceivingCall(false);
    pendingOfferRef.current = null;
    if (localStream) {
      localStream.getTracks().forEach((t) => t.stop());
      setLocalStream(null);
    }
  }, [localStream]);

  /**
   * Handle incoming answer (decrypt first).
   */
  const handleAnswer = useCallback(async (encryptedAnswer) => {
    if (peerRef.current) {
      try {
        const answer = await decryptSignaling(encryptedAnswer);
        peerRef.current.signal(answer);
      } catch (err) {
        console.error("[WebRTC] Failed to decrypt answer:", err);
        setCallError("Failed to process call answer");
      }
    }
  }, [decryptSignaling]);

  /**
   * Handle ICE candidate (validate before processing).
   */
  const handleIceCandidate = useCallback((candidate) => {
    if (peerRef.current && candidate) {
      // Basic validation of ICE candidate structure
      if (typeof candidate === "object" && candidate.candidate) {
        peerRef.current.signal({ type: "candidate", candidate });
      }
    }
  }, []);

  /**
   * End the call.
   */
  const endCall = useCallback(() => {
    if (peerRef.current) {
      peerRef.current.destroy();
      peerRef.current = null;
    }
    if (localStream) {
      localStream.getTracks().forEach((t) => t.stop());
    }
    if (remoteStream) {
      remoteStream.getTracks().forEach((t) => t.stop());
    }
    setLocalStream(null);
    setRemoteStream(null);
    setIsCallActive(false);
    setIsCalling(false);
    setIsReceivingCall(false);
    setIsMuted(false);
    setIsCameraOff(false);
    pendingOfferRef.current = null;
  }, [localStream, remoteStream]);

  /**
   * Toggle microphone mute.
   */
  const toggleMute = useCallback(() => {
    if (localStream) {
      localStream.getAudioTracks().forEach((t) => {
        t.enabled = !t.enabled;
      });
      setIsMuted((prev) => !prev);
    }
  }, [localStream]);

  /**
   * Toggle camera.
   */
  const toggleCamera = useCallback(() => {
    if (localStream) {
      localStream.getVideoTracks().forEach((t) => {
        t.enabled = !t.enabled;
      });
      setIsCameraOff((prev) => !prev);
    }
  }, [localStream]);

  /**
   * Attach streams to video elements.
   */
  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
    }
  }, [remoteStream]);

  /**
   * Cleanup on unmount.
   */
  useEffect(() => {
    return () => {
      if (localStream) {
        localStream.getTracks().forEach((t) => t.stop());
      }
      if (remoteStream) {
        remoteStream.getTracks().forEach((t) => t.stop());
      }
      if (peerRef.current) {
        peerRef.current.destroy();
      }
    };
  }, []);

  return {
    localStream,
    remoteStream,
    isCallActive,
    isCalling,
    isReceivingCall,
    callError,
    isMuted,
    isCameraOff,
    localVideoRef,
    remoteVideoRef,
    startCall,
    receiveCallOffer,
    acceptCall,
    declineCall,
    handleAnswer,
    handleIceCandidate,
    endCall,
    toggleMute,
    toggleCamera,
  };
}
