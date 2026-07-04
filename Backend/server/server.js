/**
 * @file server.js
 * @description Main entry point — Express 5 + Socket.io v4.
 *
 * SECURITY ARCHITECTURE:
 *   - Helmet for security headers (CSP, HSTS, X-Frame-Options, etc.)
 *   - CORS restricted to FRONTEND_ORIGIN — no wildcard
 *   - Per-IP rate limiting on all /api routes
 *   - Per-wallet rate limiting on authenticated routes
 *   - Redis-backed nonce auth, message queues, rate counters
 *   - Socket.io auth-gated with JWT — no events before authentication
 *   - Opaque relay IDs — server never exposes address↔socket mappings
 *   - Message batching with random delay for timing-correlation resistance
 *   - Content treated as opaque blobs — never logged or inspected
 *   - Graceful shutdown cleans up Redis + timers
 *
 * LOGGING POLICY:
 *   - ERROR only: error codes (no addresses, no IPs, no payloads)
 *   - Startup banner: port and CORS origin (no secrets)
 *   - No request logging middleware (prevents IP↔timing correlation)
 */

require("dotenv").config({ path: require("path").resolve(__dirname, ".env") });

const express = require("express");
const http = require("http");
const helmet = require("helmet");
const cors = require("cors");
const { Server } = require("socket.io");

const authRoutes = require("./auth/routes");
const userRoutes = require("./routes/users");
const groupRoutes = require("./routes/groups");
const ipfsRoutes = require("./routes/ipfs");

const { apiLimiter, challengeLimiter } = require("./security/rateLimiter");
const { initSocket, shutdownSocket } = require("./sockets/index");
const { closeRedis } = require("./queue/redis");

// ── Express ─────────────────────────────────────────────
const app = express();

// SECURITY: Helmet sets 15+ security headers including CSP, HSTS,
// X-Content-Type-Options, X-Frame-Options, Referrer-Policy
app.use(helmet());

// SECURITY: CORS restricted to single origin — no wildcard
const frontendOrigin = process.env.FRONTEND_ORIGIN || "http://localhost:3000";
app.use(cors({
  origin: frontendOrigin,
  methods: ["GET", "POST"],
  allowedHeaders: ["Content-Type", "Authorization"],
}));

app.use(express.json({ limit: "1mb" }));

// SECURITY: global per-IP rate limiting on all API routes
app.use("/api", apiLimiter);

// SECURITY: tighter rate limit specifically on challenge endpoint
app.use("/api/auth/challenge", challengeLimiter);

// ── Routes ──────────────────────────────────────────────
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/groups", groupRoutes);
app.use("/api/ipfs", ipfsRoutes);

// Health check — no sensitive info
app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// 404
app.use((_req, res) => {
  res.status(404).json({ error: "Not found" });
});

// Global error handler — SECURITY: never leak stack traces
app.use((err, _req, res, _next) => {
  console.error("[server] error:", err.code || err.type || "UNHANDLED");
  res.status(500).json({ error: "Internal error" });
});

// ── HTTP + Socket.io ────────────────────────────────────
const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: frontendOrigin, methods: ["GET", "POST"] },
  pingInterval: 25000,
  pingTimeout: 60000,
  // SECURITY: limit payload size on WebSocket frames
  maxHttpBufferSize: parseInt(process.env.MAX_MESSAGE_BYTES || "65536", 10),
});

initSocket(io);

// ── Start ───────────────────────────────────────────────
const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
  console.log("══════════════════════════════════════════════");
  console.log("  BlockChat Server v2 (Security-Hardened)");
  console.log("══════════════════════════════════════════════");
  console.log(`  HTTP  : http://localhost:${PORT}`);
  console.log(`  WS    : ws://localhost:${PORT}`);
  console.log(`  CORS  : ${frontendOrigin}`);
  console.log("══════════════════════════════════════════════");
});

// ── Graceful Shutdown ───────────────────────────────────
async function shutdown(signal) {
  console.log(`[server] ${signal} received — shutting down`);
  shutdownSocket();
  server.close();
  await closeRedis();
  process.exit(0);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

module.exports = { app, server, io };
