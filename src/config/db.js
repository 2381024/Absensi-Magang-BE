const { Pool } = require("pg");

const pool = new Pool({
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
});

// Ensure every connection uses the correct timezone
pool.on("connect", (client) => {
  const tz = process.env.APP_TIMEZONE || "Asia/Jakarta";
  client.query(`SET timezone = '${tz}'`);
});

module.exports = pool;