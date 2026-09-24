const fs = require("fs");
const path = require("path");

const DB_KEY = process.env.UPSTASH_DB_KEY || "kmi-billing-db";
const dbFile = path.join(__dirname, "db.json");

const redisUrl =
  process.env.KMI_KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const redisToken =
  process.env.KMI_KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

const useRedis = Boolean(redisUrl && redisToken);

let redis = null;
if (useRedis) {
  const { Redis } = require("@upstash/redis");
  redis = new Redis({ url: redisUrl, token: redisToken });
}

function loadSeed() {
  return JSON.parse(fs.readFileSync(dbFile, "utf8"));
}

async function loadState() {
  const data = await redis.get(DB_KEY);
  if (data) return data;
  const seed = loadSeed();
  await redis.set(DB_KEY, seed);
  return seed;
}

async function saveState(state) {
  await redis.set(DB_KEY, state);
}

module.exports = {
  useRedis,
  dbFile,
  DB_KEY,
  loadSeed,
  loadState,
  saveState,
};
