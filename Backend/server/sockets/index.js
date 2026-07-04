/**
 * @file sockets/index.js
 * @description Socket.io initialization with secure authentication.
 *
 * SECURITY CHANGES from v1:
 *   1. Socket auth uses JWT verification (same as HTTP) — v1 accepted
 *      any token in a "join" event without proper gating
 *   2. NO events are registered until authentication succeeds — v1
 *      registered handlers in the "join" callback but the socket was
 *      already connected and could emit events during the gap
 *   3. Opaque relay IDs: internal maps use SHA-256(address + serverSalt)
 *      instead of raw addresses — prevents leakage in logs/memory dumps
 *   4. Server salt rotates on restart — relay IDs are ephemeral
 *   5. No IP↔address logging at any point
 *   6. Duplicate connection from same wallet disconnects the old socket
 */

const crypto = require("crypto");
const { verifyToken } = require("../auth/jwt");
const { registerRelayHandlers, deliverPendingMessages } = require("./relay");
const { registerSignalingHandlers, cleanupSignaling } = require("../webrtc/signaling");
const { startDummyTraffic, stopBatcher } = require("./batcher");
const { getGroupManager } = require("../blockchain/contracts");

// SECURITY: server-side salt regenerated on every restart.
// This ensures relay IDs are ephemeral — a memory dump from a previous
// session cannot be correlated with the current session.
const SERVER_SALT = crypto.randomBytes(32).toString("hex");

// Bidirectional maps using opaque relay IDs
const relayToSocket = new Map(); // relayId → socket.id
const socketToRelay = new Map(); // socket.id → relayId

// Private map: address → relayId (never exposed, never logged)
// SECURITY: capped at 5000 entries to prevent unbounded growth.
// This map is effectively a social graph — if it grew unbounded,
// a memory dump would reveal every address that was ever messaged.
const addressToRelayMap = new Map();
const RELAY_MAP_MAX = 5000;

/**
 * Compute an opaque relay ID for an Ethereum address.
 * Deterministic within a server session, different across restarts.
 *
 * PRIVACY: Map is capped and periodically cleared. Since relay IDs
 * are deterministic (hash of address + salt), they can always be
 * recomputed on cache miss — no data loss.
 */
function addressToRelay(address) {
  const key = address.toLowerCase();
  if (addressToRelayMap.has(key)) return addressToRelayMap.get(key);

  // Evict entire cache when it exceeds the cap
  if (addressToRelayMap.size >= RELAY_MAP_MAX) {
    addressToRelayMap.clear();
  }

  const relayId = crypto
    .createHash("sha256")
    .update(`${key}:${SERVER_SALT}`)
    .digest("hex")
    .slice(0, 32);

  addressToRelayMap.set(key, relayId);
  return relayId;
}

// PRIVACY: periodic eviction — prevents the map from accumulating
// a full social graph over long-running sessions.
const _evictionTimer = setInterval(() => {
  addressToRelayMap.clear();
}, 600_000); // 10 minutes
_evictionTimer.unref(); // don't block process shutdown

/**
 * Fetch group member addresses from on-chain GroupManager.
 * Returns empty array if blockchain is unavailable (local dev mode).
 */
async function getGroupMembers(groupId) {
  try {
    const gm = getGroupManager();
    const [, members] = await gm.getGroupInfo(groupId);
    return members;
  } catch {
    console.warn("[sockets] getGroupMembers failed (blockchain unavailable?) — returning empty");
    return [];
  }
}

/**
 * Initialize Socket.io with secure authentication and privacy-preserving relay.
 *
 * @param {import('socket.io').Server} io
 */
function initSocket(io) {
  // Start dummy traffic generator (if enabled)
  startDummyTraffic(io, relayToSocket);

    io.on("connection", (socket) => {
    console.log("[Socket] New connection:", socket.id);
    // SECURITY: socket starts in "unauthenticated" state.
    // Only the "join" event is listened to. All other events are ignored
    // until authentication succeeds and handlers are explicitly registered.

    // SECURITY [VULN-02 FIX]: track auth state per socket to prevent
    // handler accumulation via repeated `join` calls. Without this,
    // each `join` stacks duplicate handlers — a single message would
    // trigger N relay attempts after N joins.
    let authenticated = false;

    // Auto-disconnect if no "join" within 10 seconds
    const authTimeout = setTimeout(() => {
      socket.emit("auth_error", { error: "Authentication timeout" });
      socket.disconnect(true);
    }, 10_000);

    socket.on("join", async (data) => {
      console.log("[Socket] Join attempt for socket:", socket.id);
      // SECURITY [VULN-02 FIX]: ignore repeat join attempts
      if (authenticated) return;
      clearTimeout(authTimeout);

      const { token } = data || {};
      if (!token) {
        socket.emit("auth_error", { error: "Token required" });
        socket.disconnect(true);
        return;
      }

      // verifyToken is async (Redis-backed version check)
      const decoded = await verifyToken(token);
      if (!decoded) {
        socket.emit("auth_error", { error: "Authentication failed" });
        socket.disconnect(true);
        return;
      }

      const address = decoded.sub;
      const relayId = addressToRelay(address);

      // Disconnect any existing socket for this wallet
      const existingSid = relayToSocket.get(relayId);
      if (existingSid && existingSid !== socket.id) {
        const oldSocket = io.sockets.sockets.get(existingSid);
        if (oldSocket) {
          oldSocket.emit("auth_error", { error: "Connected elsewhere" });
          oldSocket.disconnect(true);
        }
        socketToRelay.delete(existingSid);
      }

      // Register the authenticated socket
      relayToSocket.set(relayId, socket.id);
      socketToRelay.set(socket.id, relayId);
      authenticated = true;

      socket.emit("authenticated", { relayId });

      // NOW register event handlers — not before auth
      console.log("[Socket] Registering handlers for:", relayId.slice(0, 8));
      registerRelayHandlers(
        socket, io, relayId, address,
        relayToSocket, socketToRelay,
        addressToRelay, getGroupMembers
      );
      registerSignalingHandlers(socket, io, relayId, address, relayToSocket, addressToRelay);

      // Deliver any messages queued while offline
      deliverPendingMessages(relayId, io, relayToSocket).catch(() => {});
    });

    socket.on("disconnect", () => {
      clearTimeout(authTimeout);
      const relayId = socketToRelay.get(socket.id);
      if (relayId) {
        cleanupSignaling(relayId, io, relayToSocket);
        relayToSocket.delete(relayId);
        socketToRelay.delete(socket.id);
      }
    });
  });
}

/**
 * Graceful shutdown — stop batcher, clear maps.
 */
function shutdownSocket() {
  stopBatcher();
  relayToSocket.clear();
  socketToRelay.clear();
  addressToRelayMap.clear();
}

module.exports = { initSocket, shutdownSocket };
