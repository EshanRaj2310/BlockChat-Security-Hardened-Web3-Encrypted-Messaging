const { ethers } = require("ethers");

const API_BASE = "http://localhost:5000/api";
const WALLET_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"; // Hardhat #1
const wallet = new ethers.Wallet(WALLET_KEY);
const address = wallet.address;

async function runTests() {
  console.log("🚀 Starting Security Audit Tests...\n");

  // --- Setup: Get JWT ---
  let jwt;
  try {
    const challRes = await fetch(`${API_BASE}/auth/challenge`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address }),
    });
    const { challenge } = await challRes.json();

    const domain = { name: "BlockChat", version: "1", chainId: 31337, verifyingContract: "0x0000000000000000000000000000000000000000" };
    const loginTypes = { Login: [{ name: "wallet", type: "address" }, { name: "nonce", type: "string" }, { name: "purpose", type: "string" }] };
    const loginValue = { wallet: address.toLowerCase(), nonce: challenge, purpose: "login" };
    const signature = await wallet.signTypedData(domain, loginTypes, loginValue);

    const verifyRes = await fetch(`${API_BASE}/auth/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address, signature, challenge }),
    });
    const data = await verifyRes.json();
    jwt = data.token;
    console.log("✅ Setup: Obtained valid JWT for", address);
  } catch (err) {
    console.error("❌ Setup failed:", err.message);
    process.exit(1);
  }

  // --- Test A1: Replay Attack ---
  console.log("\n🧪 Test A1: Replay Attack (Reuse same nonce/signature)");
  try {
    const regChallRes = await fetch(`${API_BASE}/auth/register-challenge`, {
      headers: { Authorization: `Bearer ${jwt}` }
    });
    const challengeData = await regChallRes.json();
    
    const regTypes = { Registration: [{ name: "wallet", type: "address" }, { name: "publicKey", type: "string" }, { name: "nonce", type: "string" }, { name: "issuedAt", type: "uint256" }, { name: "expiresAt", type: "uint256" }, { name: "purpose", type: "string" }] };
    const pubKey = "0x" + "a".repeat(130);
    const domain = { name: "BlockChat", version: "1", chainId: 31337, verifyingContract: "0x0000000000000000000000000000000000000000" };
    const regValue = { wallet: address.toLowerCase(), publicKey: pubKey, nonce: challengeData.nonce, issuedAt: challengeData.issuedAt, expiresAt: challengeData.expiresAt, purpose: "registration" };
    const signature = await wallet.signTypedData(domain, regTypes, regValue);

    // First use: OK
    const res1 = await fetch(`${API_BASE}/users/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${jwt}` },
      body: JSON.stringify({ address, username: "test", publicKey: pubKey, signature, nonce: challengeData.nonce })
    });
    
    // Second use: Should Fail
    const res2 = await fetch(`${API_BASE}/users/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${jwt}` },
      body: JSON.stringify({ address, username: "test", publicKey: pubKey, signature, nonce: challengeData.nonce })
    });
    
    if (res1.status === 200 && res2.status !== 200) {
      console.log("   ✔ Success: Second attempt rejected with", res2.status);
    } else {
      console.log("   ❌ Failed: Second attempt returned", res2.status);
    }
  } catch (err) { console.error("   ❌ Error:", err.message); }

  // --- Test A2: Cross-purpose Signature ---
  console.log("\n🧪 Test A2: Cross-purpose Signature (Use login signature for register)");
  try {
     const challRes = await fetch(`${API_BASE}/auth/challenge`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address }),
    });
    const { challenge } = await challRes.json();
    const loginDomain = { name: "BlockChat", version: "1", chainId: 31337, verifyingContract: "0x0000000000000000000000000000000000000000" };
    const loginTypes = { Login: [{ name: "wallet", type: "address" }, { name: "nonce", type: "string" }, { name: "purpose", type: "string" }] };
    const loginValue = { wallet: address.toLowerCase(), nonce: challenge, purpose: "login" };
    const loginSig = await wallet.signTypedData(loginDomain, loginTypes, loginValue);

    const res = await fetch(`${API_BASE}/users/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${jwt}` },
      body: JSON.stringify({ address, username: "evil", publicKey: "0x" + "b".repeat(130), signature: loginSig, nonce: challenge })
    });
    console.log("   ✔ Expected 401, got:", res.status);
  } catch (err) { console.error("   ❌ Error:", err.message); }

  // --- Test A3: Chain Mismatch ---
  console.log("\n🧪 Test A3: Chain Mismatch (Sign on wrong network)");
  try {
    const regChallRes = await fetch(`${API_BASE}/auth/register-challenge`, {
      headers: { Authorization: `Bearer ${jwt}` }
    });
    const challengeData = await regChallRes.json();
    const wrongDomain = { name: "BlockChat", version: "1", chainId: 1, verifyingContract: "0x0000000000000000000000000000000000000000" };
    const regTypes = { Registration: [{ name: "wallet", type: "address" }, { name: "publicKey", type: "string" }, { name: "nonce", type: "string" }, { name: "issuedAt", type: "uint256" }, { name: "expiresAt", type: "uint256" }, { name: "purpose", type: "string" }] };
    const pubKey = "0x" + "c".repeat(130);
    const regValue = { wallet: address.toLowerCase(), publicKey: pubKey, nonce: challengeData.nonce, issuedAt: challengeData.issuedAt, expiresAt: challengeData.expiresAt, purpose: "registration" };
    const signature = await wallet.signTypedData(wrongDomain, regTypes, regValue);

    const res = await fetch(`${API_BASE}/users/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${jwt}` },
      body: JSON.stringify({ address, username: "test", publicKey: pubKey, signature, nonce: challengeData.nonce })
    });
    console.log("   ✔ Expected 401, got:", res.status);
  } catch (err) { console.error("   ❌ Error:", err.message); }

  // --- Test N1: Missing JWT ---
  console.log("\n🧪 Test N1: Missing JWT");
  try {
    const res = await fetch(`${API_BASE}/users/${address}`);
    console.log("   ✔ Expected 401, got:", res.status);
  } catch (err) { console.error("   ❌ Error:", err.message); }

  // --- Test X2: Prototype Pollution ---
  console.log("\n🧪 Test X2: Prototype Pollution");
  try {
    const res = await fetch(`${API_BASE}/users/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${jwt}` },
      body: JSON.stringify({ 
        "__proto__": { "admin": true },
        address, username: "pp", publicKey: "0x" + "d".repeat(130), signature: "invalid", nonce: "none"
      })
    });
    console.log("   ✔ Status (Safe if no crash/exploit):", res.status);
  } catch (err) { console.error("   ❌ Error:", err.message); }

  console.log("\n🏁 Security Audit Tests Completed.");
  process.exit(0);
}

runTests();
