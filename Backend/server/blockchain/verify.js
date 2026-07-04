/**
 * @file blockchain/verify.js
 * @description On-chain transaction verification helpers.
 *
 * SECURITY: The server never trusts client claims about write operations.
 * Every POST that references a txHash is verified against the actual
 * on-chain transaction: correct sender, correct contract, successful status.
 */

const { getProvider } = require("./contracts");
const { getRedis, prefix } = require("../queue/redis");

const TX_DEDUP_TTL = 86400; // 24h — prevent replay within this window

/**
 * Verify a transaction hash on-chain.
 *
 * @param {string} txHash           - Transaction hash to verify
 * @param {string} expectedFrom     - Expected sender address
 * @param {string} expectedContract - Expected target contract address
 * @returns {Promise<{valid: boolean, receipt: object|null, error: string|null}>}
 */
async function verifyTransaction(txHash, expectedFrom, expectedContract) {
  try {
    // SECURITY [NEW-07 FIX]: prevent txHash replay across endpoints.
    // Without this, the same registerKey tx could be submitted to
    // /register, /groups/create, etc. NX ensures one-time-use.
    const redis = getRedis();
    const txKey = prefix(`tx:used:${txHash.toLowerCase()}`);
    const wasSet = await redis.set(txKey, "1", "EX", TX_DEDUP_TTL, "NX");
    if (!wasSet) {
      return { valid: false, receipt: null, error: "Transaction already processed" };
    }

    const provider = getProvider();
    const [tx, receipt] = await Promise.all([
      provider.getTransaction(txHash),
      provider.getTransactionReceipt(txHash),
    ]);

    if (!tx || !receipt) {
      return { valid: false, receipt: null, error: "Transaction not found" };
    }
    if (receipt.status !== 1) {
      return { valid: false, receipt, error: "Transaction reverted" };
    }
    if (tx.from.toLowerCase() !== expectedFrom.toLowerCase()) {
      return { valid: false, receipt, error: "Sender mismatch" };
    }
    if (tx.to && tx.to.toLowerCase() !== expectedContract.toLowerCase()) {
      return { valid: false, receipt, error: "Contract mismatch" };
    }

    return { valid: true, receipt, error: null };
  } catch (err) {
    // SECURITY: generic error — never expose provider internals
    return { valid: false, receipt: null, error: "Verification failed" };
  }
}

/**
 * Extract groupId from a GroupCreated event in a receipt.
 */
function extractGroupIdFromReceipt(receipt, contractInterface) {
  for (const log of receipt.logs) {
    try {
      const parsed = contractInterface.parseLog({ topics: log.topics, data: log.data });
      if (parsed && parsed.name === "GroupCreated") return parsed.args.groupId.toString();
    } catch { /* different contract/event — skip */ }
  }
  return null;
}

module.exports = { verifyTransaction, extractGroupIdFromReceipt };
