const { ethers } = require("ethers");

const API_BASE = "http://localhost:5000/api";
const KEY_A = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"; // Hardhat #1
const KEY_B = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d"; // Hardhat #2

async function register(key, username) {
  const wallet = new ethers.Wallet(key);
  const address = wallet.address;

  // 1. Get login challenge
  const challRes = await fetch(`${API_BASE}/auth/challenge`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ address }),
  });
  const { challenge } = await challRes.json();

  // 2. Sign login challenge
  const domain = { name: "BlockChat", version: "1", chainId: 31337, verifyingContract: "0x0000000000000000000000000000000000000000" };
  const loginTypes = { Login: [{ name: "wallet", type: "address" }, { name: "nonce", type: "string" }, { name: "purpose", type: "string" }] };
  const loginValue = { wallet: address.toLowerCase(), nonce: challenge, purpose: "login" };
  const loginSig = await wallet.signTypedData(domain, loginTypes, loginValue);

  // 3. Verify login
  const verifyRes = await fetch(`${API_BASE}/auth/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ address, signature: loginSig, challenge }),
  });
  const { token } = await verifyRes.json();

  // 4. Get register challenge
  const regChallRes = await fetch(`${API_BASE}/auth/register-challenge`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const challengeData = await regChallRes.json();

  // 5. Sign register challenge
  const regTypes = { Registration: [{ name: "wallet", type: "address" }, { name: "publicKey", type: "string" }, { name: "nonce", type: "string" }, { name: "issuedAt", type: "uint256" }, { name: "expiresAt", type: "uint256" }, { name: "purpose", type: "string" }] };
  const pubKey = "0x" + "a".repeat(130);
  const regValue = { wallet: address.toLowerCase(), publicKey: pubKey, nonce: challengeData.nonce, issuedAt: challengeData.issuedAt, expiresAt: challengeData.expiresAt, purpose: "registration" };
  const regSig = await wallet.signTypedData(domain, regTypes, regValue);

  // 6. Register
  const res = await fetch(`${API_BASE}/users/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ address, username, publicKey: pubKey, signature: regSig, nonce: challengeData.nonce })
  });
  
  if (res.ok) {
    console.log(`✅ User ${username} (${address}) registered.`);
  } else {
    console.error(`❌ User ${username} registration failed:`, await res.text());
  }
  return { address, token };
}

async function run() {
  await register(KEY_A, "Alice");
  await register(KEY_B, "Bob");
  process.exit(0);
}

run();
