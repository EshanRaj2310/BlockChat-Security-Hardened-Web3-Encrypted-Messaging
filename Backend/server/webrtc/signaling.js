/**
 * @file webrtc/signaling.js
 * @description Encrypted WebRTC signaling relay.
 *
 * SECURITY CHANGES from v1:
 *   1. Signaling payloads are validated for size to prevent abuse
 *   2. NO signaling data is stored — ephemeral relay only
 *   3. Uses opaque relay IDs — server doesn't see raw addresses
 *   4. Payload content is never logged or inspected
 *   5. Active calls tracked only for cleanup — no persistent record
 *
 * IMPORTANT: Clients MUST encrypt SDP offers/answers before sending.
 * Plaintext SDP exposes IP addresses via ICE candidates. The server
 * enforces opaque payloads but cannot verify encryption — this is
 * a client-side responsibility documented in the API contract.
 */

const { validateSignalingPayload } = require("../security/validator");
const { checkWalletRate } = require("../security/rateLimiter");

// Ephemeral call tracking — only for disconnect cleanup, never persisted
const activeCalls = new Map(); // relayId → peerRelayId

/**
 * Register WebRTC signaling handlers on an authenticated socket.
 *
 * @param {import('socket.io').Socket} socket
 * @param {import('socket.io').Server} io
 * @param {string} relayId
 * @param {Map<string, string>} relayToSocket
 * @param {function} addressToRelay
 */
function registerSignalingHandlers(socket, io, relayId, walletAddress, relayToSocket, addressToRelay) {

  socket.on("call_offer", async (data) => {
    // SECURITY [NEW-06 FIX]: rate limit signaling events
    if (!(await checkWalletRate(walletAddress))) return;
    const v = validateSignalingPayload(data);
    if (!v.valid) { socket.emit("error_msg", { error: v.error }); return; }

    const { to, offer } = data;
    const peerRelay = addressToRelay(to);
    const sid = relayToSocket.get(peerRelay);

    if (sid) {
      // Track the call for cleanup on disconnect
      activeCalls.set(relayId, peerRelay);
      activeCalls.set(peerRelay, relayId);
      // SECURITY: forward opaque payload — never inspect `offer` contents
      io.to(sid).emit("incoming_call", { from: relayId, offer });
    }
  });

  socket.on("call_answer", async (data) => {
    if (!(await checkWalletRate(walletAddress))) return;
    const v = validateSignalingPayload(data);
    if (!v.valid) { socket.emit("error_msg", { error: v.error }); return; }

    const { to, answer } = data;
    const peerRelay = addressToRelay(to);
    const sid = relayToSocket.get(peerRelay);

    if (sid) {
      io.to(sid).emit("call_answer", { from: relayId, answer });
    }
  });

  socket.on("ice_candidate", async (data) => {
    if (!(await checkWalletRate(walletAddress))) return;
    const v = validateSignalingPayload(data);
    if (!v.valid) return; // silently drop invalid ICE candidates

    const { to, candidate } = data;
    const peerRelay = addressToRelay(to);
    const sid = relayToSocket.get(peerRelay);

    if (sid) {
      io.to(sid).emit("ice_candidate", { from: relayId, candidate });
    }
  });
}

/**
 * Clean up active call session on disconnect.
 * Notifies the peer that the call ended.
 */
function cleanupSignaling(relayId, io, relayToSocket) {
  const peer = activeCalls.get(relayId);
  if (peer) {
    activeCalls.delete(relayId);
    activeCalls.delete(peer);
    const peerSid = relayToSocket.get(peer);
    if (peerSid) {
      io.to(peerSid).emit("call_ended", { reason: "peer_disconnected" });
    }
  }
}

module.exports = { registerSignalingHandlers, cleanupSignaling };
