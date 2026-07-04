/**
 * @file queue/redis.js
 * @description Redis client singleton with in-memory fallback.
 *
 * STRATEGY: Start with MemoryStore immediately so the server works
 * from the first request. Attempt Redis connection in background.
 * If Redis connects, swap to real Redis. If not, MemoryStore continues.
 */

let client = null;
let usingFallback = true; // Start with fallback, upgrade if Redis connects

// ── In-Memory Fallback ──────────────────────────────────────────────
class MemoryStore {
  constructor() {
    this._store = new Map();
    this._ttls = new Map();
  }

  _checkExpiry(key) {
    const exp = this._ttls.get(key);
    if (exp && Date.now() > exp) {
      this._store.delete(key);
      this._ttls.delete(key);
      return true;
    }
    return false;
  }

  async get(key) {
    this._checkExpiry(key);
    const val = this._store.get(key);
    return val !== undefined ? String(val) : null;
  }

  async set(key, value, ...args) {
    this._store.set(key, value);
    if (args[0] === "EX" && args[1]) {
      this._ttls.set(key, Date.now() + args[1] * 1000);
    }
    return "OK";
  }

  async getdel(key) {
    this._checkExpiry(key);
    const val = this._store.get(key);
    this._store.delete(key);
    this._ttls.delete(key);
    return val !== undefined ? String(val) : null;
  }

  async del(key) {
    this._store.delete(key);
    this._ttls.delete(key);
    return 1;
  }

  async incr(key) {
    this._checkExpiry(key);
    const val = parseInt(this._store.get(key) || "0", 10) + 1;
    this._store.set(key, String(val));
    return val;
  }

  async expire(key, seconds) {
    this._ttls.set(key, Date.now() + seconds * 1000);
    return 1;
  }

  async rpush(key, ...values) {
    if (!this._store.has(key)) this._store.set(key, []);
    const list = this._store.get(key);
    list.push(...values);
    return list.length;
  }

  async llen(key) {
    this._checkExpiry(key);
    const list = this._store.get(key);
    return Array.isArray(list) ? list.length : 0;
  }

  async lrange(key, start, stop) {
    this._checkExpiry(key);
    const list = this._store.get(key) || [];
    if (stop === -1) return list.slice(start);
    return list.slice(start, stop + 1);
  }

  async lrem(key, count, value) {
    const list = this._store.get(key) || [];
    const idx = list.indexOf(value);
    if (idx !== -1) {
      list.splice(idx, 1);
      return 1;
    }
    return 0;
  }

  async zadd(key, score, member) {
    if (!this._store.has(key)) this._store.set(key, []);
    const set = this._store.get(key);
    set.push({ score, member });
    return 1;
  }

  async zcard(key) {
    this._checkExpiry(key);
    const set = this._store.get(key);
    return Array.isArray(set) ? set.length : 0;
  }

  async zremrangebyscore(key, min, max) {
    const set = this._store.get(key);
    if (!Array.isArray(set)) return 0;
    const before = set.length;
    const filtered = set.filter(e => e.score < min || e.score > max);
    this._store.set(key, filtered);
    return before - filtered.length;
  }

  async eval(script, numkeys, ...args) {
    if (script.includes("rpush")) {
      const key = args[0];
      const max = parseInt(args[1], 10);
      const payload = args[2];
      const ttl = parseInt(args[3], 10);
      if (!this._store.has(key)) this._store.set(key, []);
      const list = this._store.get(key);
      if (list.length >= max) return 0;
      list.push(payload);
      this._ttls.set(key, Date.now() + ttl * 1000);
      return 1;
    }
    if (script.includes("lrange") && script.includes("del")) {
      const key = args[0];
      const items = this._store.get(key) || [];
      this._store.delete(key);
      this._ttls.delete(key);
      return items;
    }
    return 1;
  }

  pipeline() {
    const ops = [];
    const self = this;
    const pipe = {
      zremrangebyscore: (...a) => { ops.push(() => self.zremrangebyscore(...a)); return pipe; },
      zadd: (...a) => { ops.push(() => self.zadd(...a)); return pipe; },
      zcard: (...a) => { ops.push(() => self.zcard(...a)); return pipe; },
      expire: (...a) => { ops.push(() => self.expire(...a)); return pipe; },
      rpush: (...a) => { ops.push(() => self.rpush(...a)); return pipe; },
      llen: (...a) => { ops.push(() => self.llen(...a)); return pipe; },
      set: (...a) => { ops.push(() => self.set(...a)); return pipe; },
      get: (...a) => { ops.push(() => self.get(...a)); return pipe; },
      del: (...a) => { ops.push(() => self.del(...a)); return pipe; },
      async exec() {
        const results = [];
        for (const op of ops) {
          try {
            const val = await op();
            results.push([null, val]);
          } catch (err) {
            results.push([err, null]);
          }
        }
        return results;
      }
    };
    return pipe;
  }

  on() { return this; }
  async quit() {}
}

// ── Initialize immediately with MemoryStore ─────────────────────────
client = new MemoryStore();
console.log("[redis] Using in-memory store (attempting Redis connection in background...)");

// Try Redis connection in background — upgrade if successful
try {
  const Redis = require("ioredis");
  const url = process.env.REDIS_URL || "redis://127.0.0.1:6379";

  const redis = new Redis(url, {
    maxRetriesPerRequest: 1,
    retryStrategy(times) {
      if (times > 2) return null; // Stop retrying after 2 attempts
      return Math.min(times * 500, 2000);
    },
    enableReadyCheck: true,
    lazyConnect: true,
    connectTimeout: 3000,
  });

  redis.on("error", () => {
    // Silently stay on MemoryStore
  });

  redis.on("ready", () => {
    console.log("[redis] Redis connected — upgrading from in-memory store");
    client = redis;
    usingFallback = false;
  });

  // Attempt connection (non-blocking)
  redis.connect().catch(() => {
    console.log("[redis] Redis unavailable — continuing with in-memory store");
  });
} catch {
  console.log("[redis] ioredis not available — continuing with in-memory store");
}

// ── Exports ─────────────────────────────────────────────────────────

function getRedis() {
  return client;
}

function prefix(key) {
  return `${process.env.REDIS_KEY_PREFIX || "blockchat:"}${key}`;
}

async function closeRedis() {
  if (client && !usingFallback) {
    await client.quit();
  }
  client = new MemoryStore();
  usingFallback = true;
}

module.exports = { getRedis, prefix, closeRedis };
