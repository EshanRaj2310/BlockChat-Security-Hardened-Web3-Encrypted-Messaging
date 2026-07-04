/**
 * @file blockchain/contracts.js
 * @description Read-only ethers.js contract instances for on-chain queries.
 *
 * SECURITY NOTE: The server uses a read-only provider (no signer).
 * All write transactions originate from client wallets — the server
 * only verifies that transactions happened correctly on-chain.
 */

const { ethers } = require("ethers");
const path = require("path");
const fs = require("fs");

function loadABI(contractName) {
  const p = path.resolve(__dirname, "..", "..", "artifacts", "contracts", `${contractName}.sol`, `${contractName}.json`);
  return JSON.parse(fs.readFileSync(p, "utf-8")).abi;
}

let provider = null;
let identityRegistry = null;
let groupManager = null;
let auditLog = null;

function getProvider() {
  if (!provider) {
    provider = new ethers.JsonRpcProvider(process.env.SEPOLIA_RPC_URL);
  }
  return provider;
}

function getIdentityRegistry() {
  if (!identityRegistry) {
    identityRegistry = new ethers.Contract(process.env.IDENTITY_REGISTRY_ADDRESS, loadABI("IdentityRegistry"), getProvider());
  }
  return identityRegistry;
}

function getGroupManager() {
  if (!groupManager) {
    groupManager = new ethers.Contract(process.env.GROUP_MANAGER_ADDRESS, loadABI("GroupManager"), getProvider());
  }
  return groupManager;
}

function getAuditLog() {
  if (!auditLog) {
    auditLog = new ethers.Contract(process.env.AUDIT_LOG_ADDRESS, loadABI("AuditLog"), getProvider());
  }
  return auditLog;
}

module.exports = { getProvider, getIdentityRegistry, getGroupManager, getAuditLog };
