const { ethers } = require("ethers");
const { io } = require("socket.io-client");

const API_BASE = "http://localhost:5000/api";
const SOCKET_URL = "http://localhost:5000";
const KEY_A = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"; // Alice
const KEY_B = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d"; // Bob

async function getJWT(key) {
  const wallet = new ethers.Wallet(key);
  const address = wallet.address;
  const challRes = await fetch(`${API_BASE}/auth/challenge`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ address }),
  });
  const { challenge } = await challRes.json();
  const domain = { name: "BlockChat", version: "1", chainId: 31337, verifyingContract: "0x0000000000000000000000000000000000000000" };
  const types = { Login: [{ name: "wallet", type: "address" }, { name: "nonce", type: "string" }, { name: "purpose", type: "string" }] };
  const value = { wallet: address.toLowerCase(), nonce: challenge, purpose: "login" };
  const signature = await wallet.signTypedData(domain, types, value);
  const verifyRes = await fetch(`${API_BASE}/auth/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ address, signature, challenge }),
  });
  const { token } = await verifyRes.json();
  return { address, token };
}

async function testMessaging() {
  const alice = await getJWT(KEY_A);
  const bob = await getJWT(KEY_B);

  console.log("Connecting Alice...");
  const socketA = io(SOCKET_URL, { auth: { token: alice.token } });
  
  console.log("Connecting Bob...");
  const socketB = io(SOCKET_URL, { auth: { token: bob.token } });

  return new Promise((resolve, reject) => {
    socketB.on("connect", () => {
      console.log("Bob socket connected. Sending join...");
      socketB.emit("join", { address: bob.address, token: bob.token });
    });

    socketB.on("authenticated", (data) => {
      console.log("Bob authenticated:", data.relayId.slice(0, 8));
    });

    socketB.on("auth_error", (data) => {
      console.error("Bob auth error:", data.error);
    });

    socketA.on("connect", () => {
      console.log("Alice socket connected. Sending join...");
      socketA.emit("join", { address: alice.address, token: alice.token });
    });

    socketA.on("authenticated", (data) => {
      console.log("Alice authenticated:", data.relayId.slice(0, 8));
      
      // Give time for join to process
      setTimeout(() => {
        console.log("Alice sending message to Bob...");
        socketA.emit("send_message", {
          to: bob.address,
          messageId: "test-msg-1",
          cid: "QmbWqxBEKC3P8tqsKc98xmWNzrzDtRLMiMPL8wBuTGsMnR", // Mock CID
          type: "text",
          iv: "iv-base64",
          ephemeralPub: "pub-base64",
          messageNonce: "nonce-base64",
          timestamp: Date.now()
        });
      }, 1000);
    });

    socketA.on("auth_error", (data) => {
      console.error("Alice auth error:", data.error);
    });

    socketB.on("receive_message", (data) => {
      console.log("✅ Bob received message from:", data.from);
      console.log("   Content CID:", data.cid);
      socketA.disconnect();
      socketB.disconnect();
      resolve();
    });

    setTimeout(() => {
      socketA.disconnect();
      socketB.disconnect();
      reject(new Error("Test timed out — message not received."));
    }, 10000);
  });
}

testMessaging()
  .then(() => {
    console.log("🚀 Messaging test PASSED!");
    process.exit(0);
  })
  .catch((err) => {
    console.error("❌ Messaging test FAILED:", err.message);
    process.exit(1);
  });
