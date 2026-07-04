/**
 * @file sockets/batcher.js
 * @description Message batching with random delay for metadata privacy.
 *
 * SECURITY RATIONALE:
 *   Without batching, an observer monitoring network traffic can correlate:
 *     "User A sent at T=100ms, User B received at T=102ms → A messaged B"
 *
 *   Message batching adds random delay (100–500ms) before delivery, which:
 *   1. Breaks timing correlation between sender and receiver
 *   2. Makes traffic analysis significantly harder
 *   3. Optional dummy traffic further obscures real message patterns
 *
 *   Trade-off: adds ~300ms average latency — acceptable for messaging,
 *   NOT used for WebRTC signaling (where latency matters).
 */

const BATCH_DELAY_MIN = parseInt(process.env.BATCH_DELAY_MIN_MS || "100", 10);
const BATCH_DELAY_MAX = parseInt(process.env.BATCH_DELAY_MAX_MS || "500", 10);
const ENABLE_DUMMY = process.env.ENABLE_DUMMY_TRAFFIC === "true";

// Active batch timers — cleared on shutdown
const activeTimers = new Set();

/**
 * Generate a random delay between min and max milliseconds.
 * Uses crypto.getRandomValues for uniform distribution (not Math.random).
 */
function randomDelay() {
  const range = BATCH_DELAY_MAX - BATCH_DELAY_MIN;
  // crypto.getRandomValues gives better uniformity than Math.random
  const bytes = new Uint32Array(1);
  require("crypto").getRandomValues(bytes);
  return BATCH_DELAY_MIN + (bytes[0] % (range + 1));
}

/**
 * Schedule a message for delayed delivery.
 * The callback is invoked after a random delay.
 *
 * @param {function} deliverFn - Function to call for actual delivery
 * @returns {void}
 */
function scheduleDelivery(deliverFn) {
  const delay = randomDelay();
  const timer = setTimeout(() => {
    activeTimers.delete(timer);
    deliverFn();
  }, delay);
  activeTimers.add(timer);
}

/**
 * Generate dummy traffic to connected sockets.
 * Called periodically when ENABLE_DUMMY_TRAFFIC is true.
 *
 * WHY: Without dummy traffic, an observer can determine which users are
 * actively chatting by watching traffic volume. Dummy traffic creates
 * background noise that makes this analysis unreliable.
 *
 * Dummy messages have a `_dummy: true` flag that clients discard silently.
 *
 * @param {import('socket.io').Server} io
 * @param {Map<string, string>} relayToSocket - relay ID → socket ID mapping
 */
function emitDummyTraffic(io, relayToSocket) {
  if (!ENABLE_DUMMY || relayToSocket.size === 0) return;

  // Pick a random connected socket
  const relayIds = Array.from(relayToSocket.keys());
  const bytes = new Uint32Array(1);
  require("crypto").getRandomValues(bytes);
  const targetRelay = relayIds[bytes[0] % relayIds.length];
  const targetSid = relayToSocket.get(targetRelay);

  if (targetSid) {
    io.to(targetSid).emit("receive_message", {
      _dummy: true,
      messageId: require("crypto").randomUUID(),
      timestamp: Date.now(),
    });
  }
}

/** Start periodic dummy traffic generation. */
function startDummyTraffic(io, relayToSocket) {
  if (!ENABLE_DUMMY) return null;

  // Random interval between 5–30 seconds
  const tick = () => {
    emitDummyTraffic(io, relayToSocket);
    const next = 5000 + Math.floor(Math.random() * 25000);
    return setTimeout(() => { const t = tick(); activeTimers.add(t); }, next);
  };
  const initial = tick();
  activeTimers.add(initial);
  return initial;
}

/** Clean up all pending timers on shutdown. */
function stopBatcher() {
  for (const t of activeTimers) clearTimeout(t);
  activeTimers.clear();
}

module.exports = { scheduleDelivery, startDummyTraffic, stopBatcher };
