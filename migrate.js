require("dotenv").config();

const fs = require("fs");
const path = require("path");
const bcrypt = require("bcrypt");
const pool = require("./src/config/db");

async function run() {
  const client = await pool.connect();
  try {
    // 1. Run migration v4 SQL
    console.log("🔄 Running migration v4...");
    const migrationV4Sql = fs.readFileSync(path.join(__dirname, "migration_v4.sql"), "utf8");
    await client.query(migrationV4Sql);
    console.log("✅ Migration v4 completed — user ↔ geofence assignments added.");

    // 2. Optional seeding (only if --seed flag is passed, uses DO NOTHING on conflict)
    const shouldSeed = process.argv.includes("--seed");
    if (shouldSeed) {
      console.log("🌱 Seeding users...");
      const rounds = 10;
      const adminHash = await bcrypt.hash("admin123", rounds);
      const userHash = await bcrypt.hash("user123", rounds);

      await client.query(
        `INSERT INTO users (username, password_hash, email, full_name, role, position, department, phone_number)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (username) DO NOTHING`,
        [
          "admin",
          adminHash,
          "admin@company.com",
          "Administrator",
          "admin",
          "System Admin",
          "IT",
          "081111111111",
        ]
      );
      console.log("  ✔ admin / admin123 (role: admin)");

      await client.query(
        `INSERT INTO users (username, password_hash, email, full_name, role, position, department, phone_number)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (username) DO NOTHING`,
        [
          "user1",
          userHash,
          "user1@company.com",
          "John Doe",
          "user",
          "Developer",
          "Engineering",
          "082222222222",
        ]
      );
      console.log("  ✔ user1 / user123 (role: user)");
    } else {
      console.log("ℹ Skipping seeding. (Run with --seed if you want to seed default accounts)");
    }

    console.log("\n🎉 Database ready!");
  } catch (err) {
    console.error("❌ Migration failed:", err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

run();