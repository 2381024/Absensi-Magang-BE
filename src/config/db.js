const { Pool, types } = require("pg");

// Override default DATE parser (OID 1082).
// Prevent pg from converting DATE into a local Date object, which causes timezone shifts when stringified.
types.setTypeParser(1082, (val) => val);

// Parse connection pool settings from env with sensible defaults
const POOL_MAX = parseInt(process.env.DB_POOL_MAX || "20", 10);
const POOL_MIN = parseInt(process.env.DB_POOL_MIN || "2", 10);
const POOL_IDLE_TIMEOUT_MS = parseInt(process.env.DB_POOL_IDLE_TIMEOUT_MS || "30000", 10);
const POOL_CONNECTION_TIMEOUT_MS = parseInt(process.env.DB_POOL_CONNECTION_TIMEOUT_MS || "5000", 10);
const STATEMENT_TIMEOUT_MS = parseInt(process.env.DB_STATEMENT_TIMEOUT_MS || "10000", 10);

const pool = new Pool({
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  max: POOL_MAX,
  min: POOL_MIN,
  idleTimeoutMillis: POOL_IDLE_TIMEOUT_MS,
  connectionTimeoutMillis: POOL_CONNECTION_TIMEOUT_MS,
});

// Ensure every connection uses the correct timezone and query timeout
pool.on("connect", (client) => {
  const tz = process.env.APP_TIMEZONE || "Asia/Jakarta";
  // PostgreSQL SET does not support parameterized queries; validate the timezone
  // string against a strict regex to prevent injection since APP_TIMEZONE is
  // an environment variable (not end-user input).
  const safeTz = /^[a-zA-Z0-9_\/+-]+$/.test(tz) ? tz : "Asia/Jakarta";
  // Set timezone and statement timeout per connection.
  // statement_timeout aborts any query that takes longer than STATEMENT_TIMEOUT_MS,
  // preventing runaway queries from blocking the pool.
  client.query(`SET timezone = '${safeTz}'`);
  client.query(`SET statement_timeout = '${STATEMENT_TIMEOUT_MS}'`);
});

// Log pool errors instead of crashing the process
pool.on("error", (err) => {
  console.error("Unexpected PostgreSQL pool error:", err.message);
});

// Graceful shutdown helper
const closePool = async () => {
  try {
    await pool.end();
    console.log("PostgreSQL pool has ended");
  } catch (err) {
    console.error("Error ending PostgreSQL pool:", err.message);
  }
};

module.exports = pool;
module.exports.closePool = closePool;