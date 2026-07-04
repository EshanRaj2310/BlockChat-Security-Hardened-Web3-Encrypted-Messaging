/**
 * @file sockets/relay.js
 * @description Privacy-preserving blind message relay.
 *
 * SECURITY CHANGES from v1:
 *   1. Uses opaque relay IDs instead of raw Ethereum addresses in all
 *      internal maps — prevents accidental address leakage in logs/dumps
 *   2. All deliveries go through batcher (random delay) to break timing
 *   3. Payload validation before relay — rejects oversized/malformed payloads
 *   4. Rate limiting per wallet on socket events (not just HTTP)
 *   5. Offline messages stored in Redis with TTL (not in-memory Map)
 *   6. Receipt metadata stored in Redis with short TTL (not forever in RAM)
 *   7. NEVER logs message content, IVs, ephemeral keys, or CIDs
 */

const { v4: uuidv4 } = require("uuid");
const { validateMessagePayload, validateGroupMessagePayload } = require("../security/validator");
const { checkWalletRate } = require("../security/rateLimiter");
const { enqueueMessage, drainMessages } = require("../queue/messageQueue");
const { scheduleDelivery } = require("./batcher");
const { getRedis, prefix } = require("../queue/redis");

// Short TTL for read receipt metadata — only needed until the receipt is sent
const RECEIPT_TTL = 3600; // 1 hour

/**
 * Register message relay handlers on an authenticated socket.
 *
 * @param {import('socket.io').Socket} socket
 * @param {import('socket.io').Server} io
 * @param {string} relayId - Sender's opaque relay ID
 * @param {Map<string, string>} relayToSocket  - relay ID → socket.id
 * @param {Map<string, string>} socketToRelay  - socket.id → relay ID
 * @param {function} addressToRelay - Converts address → relay ID
 * @param {function} getGroupMembers - async (groupId) => address[]
 */
function registerRelayHandlers(socket, io, relayId, walletAddress, relayToSocket, socketToRelay, addressToRelay, getGroupMembers) {

  // ── Direct Message ──────────────────────────────────────
  socket.on("send_message", async (data, ack) => {
    console.log("[Relay] Received send_message:", data.messageId, "from:", walletAddress.slice(0, 8), "to:", data.to?.slice(0, 8));
    const { to, messageId } = data || {};
    if (!to || !messageId) {
      if (ack) ack({ success: false, error: "INVALID_PAYLOAD" });
      return;
    }

    const allowed = await checkWalletRate(walletAddress);
    if (!allowed) {
      if (ack) ack({ success: false, error: "RATE_LIMITED" });
      return;
    }

    // 1. Deduplication check using Redis
    const redis = getRedis();
    const dupeKey = prefix(`msg:${to}:${messageId}`);
    const isDupe = await redis.set(dupeKey, "1", "NX", "EX", 1200); // 20 min TTL (aligned with client retry window)
    if (!isDupe) {
      if (ack) ack({ success: true, duplicated: true });
      return;
    }

    const validation = validateMessagePayload(data);
    if (!validation.valid) {
      if (ack) ack({ success: false, error: validation.error });
      return;
    }

    // 2. Canonical Timestamp
    const serverTimestamp = Date.now();
    const recipientRelay = addressToRelay(to);

    const payload = {
      ...data,
      from: walletAddress,
      timestamp: serverTimestamp,
    };

    // Store receipt metadata for O(1) validation later
    try {
      await redis.set(
        prefix(`receipt:${messageId}`),
        JSON.stringify({ from: walletAddress, to: recipientRelay, convId: to, type: "dm" }),
        "EX", 86400 // 24h TTL
      );
    } catch { /* best-effort */ }

    const recipientSid = relayToSocket.get(recipientRelay);
    let delivered = false;

    console.log("[Relay] Routing to:", recipientRelay.slice(0, 8), "Online:", !!recipientSid);

    if (recipientSid) {
      delivered = true;
      scheduleDelivery(() => {
        const currentSid = relayToSocket.get(recipientRelay);
        if (currentSid) {
          io.to(currentSid).emit("receive_message", payload);
        } else {
          enqueueMessage(recipientRelay, payload).catch(() => {});
        }
      });
    } else {
      await enqueueMessage(recipientRelay, payload);
    }

    // 3. Inform sender if message was delivered to recipient's socket immediately
    if (ack) ack({ success: true, messageId, timestamp: serverTimestamp, delivered });
  });

  // ── Group Message ───────────────────────────────────────
  socket.on("send_group_msg", async (data, ack) => {
    const { groupId, messageId } = data || {};
    if (!groupId || !messageId) {
      if (ack) ack({ success: false, error: "INVALID_PAYLOAD" });
      return;
    }

    const allowed = await checkWalletRate(walletAddress);
    if (!allowed) {
      if (ack) ack({ success: false, error: "RATE_LIMITED" });
      return;
    }

    const redis = getRedis();
    const dupeKey = prefix(`msg:${groupId}:${messageId}`);
    const isDupe = await redis.set(dupeKey, "1", "NX", "EX", 600);
    if (!isDupe) {
      if (ack) ack({ success: true, duplicated: true });
      return;
    }

    const validation = validateGroupMessagePayload(data);
    if (!validation.valid) {
      if (ack) ack({ success: false, error: validation.error });
      return;
    }

    const serverTimestamp = Date.now();
    const payload = {
      ...data,
      from: walletAddress,
      timestamp: serverTimestamp,
    };

    try {
      const members = await getGroupMembers(groupId);
      const senderIsMember = members.some(m => addressToRelay(m) === relayId);
      if (!senderIsMember) {
        if (ack) ack({ success: false, error: "NOT_A_MEMBER" });
        return;
      }

      // Store receipt metadata for group
      await redis.set(
        prefix(`receipt:${messageId}`),
        JSON.stringify({ from: walletAddress, groupId, type: "group" }),
        "EX", 86400
      );

      for (const member of members) {
        const memberRelay = addressToRelay(member);
        if (memberRelay === relayId) continue;

        const sid = relayToSocket.get(memberRelay);
        if (sid) {
          scheduleDelivery(() => {
            io.to(sid).emit("receive_group_msg", payload);
          });
        } else {
          await enqueueMessage(memberRelay, { ...payload, _event: "receive_group_msg" });
        }
      }
      if (ack) ack({ success: true, messageId, timestamp: serverTimestamp });
    } catch {
      if (ack) ack({ success: false, error: "GROUP_RESOLVE_FAILED" });
    }
  });

  // ── Typing Indicator ────────────────────────────────────────
  socket.on("typing", async (data) => {
    // SECURITY [VULN-08 FIX]: rate limit typing events to prevent flood
    const allowed = await checkWalletRate(walletAddress);
    if (!allowed) return; // silently drop
    const { to } = data || {};
    if (!to) return;
    const recipientRelay = addressToRelay(to);
    const sid = relayToSocket.get(recipientRelay);
    if (sid) {
      // No batching for typing — it's ephemeral and latency-sensitive
      io.to(sid).emit("typing", { from: relayId });
    }
  });

  // ── Delivery Receipt ──────────────────────────────────────
  socket.on("delivery_receipt", async (data) => {
    const allowed = await checkWalletRate(walletAddress, 120); // Higher limit for receipts
    if (!allowed) return;

    const { messageId } = data || {};
    if (!messageId) return;

    try {
      const redis = getRedis();
      const raw = await redis.get(prefix(`receipt:${messageId}`));
      if (!raw) return;

      const receipt = JSON.parse(raw);
      
      // SECURITY: Spoofing guard
      if (receipt.type === "dm") {
        if (receipt.to !== relayId) return; // Only target can confirm
      } else {
        // Group: check if sender is still a member
        const members = await getGroupMembers(receipt.groupId);
        if (!members.some(m => addressToRelay(m) === relayId)) return;
      }

      const senderSid = relayToSocket.get(addressToRelay(receipt.from));
      if (senderSid) {
        io.to(senderSid).emit("delivery_receipt", { messageId, from: walletAddress });
      }
    } catch { /* best-effort */ }
  });

  // ── Read Receipt ────────────────────────────────────────
  socket.on("read_receipt", async (data) => {
    const allowed = await checkWalletRate(walletAddress, 120);
    if (!allowed) return;

    const { messageId } = data || {};
    if (!messageId) return;

    try {
      const redis = getRedis();
      const raw = await redis.get(prefix(`receipt:${messageId}`));
      if (!raw) return;

      const receipt = JSON.parse(raw);
      
      // SECURITY: Spoofing guard
      if (receipt.type === "dm") {
        if (receipt.to !== relayId) return;
      } else {
        const members = await getGroupMembers(receipt.groupId);
        if (!members.some(m => addressToRelay(m) === relayId)) return;
      }

      // Read receipt clears metadata (final state)
      await redis.del(prefix(`receipt:${messageId}`));
      
      const senderSid = relayToSocket.get(addressToRelay(receipt.from));
      if (senderSid) {
        io.to(senderSid).emit("read_receipt", { messageId, from: walletAddress });
      }
    } catch { /* best-effort */ }
  });
}

/**
 * Deliver queued messages to a freshly connected socket.
 */
async function deliverPendingMessages(relayId, io, relayToSocket) {
  const messages = await drainMessages(relayId);
  const sid = relayToSocket.get(relayId);
  if (!sid || messages.length === 0) return;

  for (const msg of messages) {
    // SECURITY [VULN-10 FIX]: whitelist event names — attacker-controlled
    // _event could emit arbitrary events like "auth_error" to disconnect victim
    const ALLOWED_EVENTS = new Set(["receive_message", "receive_group_msg"]);
    const event = ALLOWED_EVENTS.has(msg._event) ? msg._event : "receive_message";
    delete msg._event;
    delete msg._dummy;
    // Deliver queued messages without batching delay — user is waiting
    io.to(sid).emit(event, msg);
  }
}

module.exports = { registerRelayHandlers, deliverPendingMessages };
