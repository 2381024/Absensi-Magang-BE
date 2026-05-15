require("dotenv").config();

const fs = require("fs");
const path = require("path");
const bcrypt = require("bcrypt");
const pool = require("./src/config/db");

async function run() {
  const client = await pool.connect();
  try {
    // 1. Run migration SQL
    console.log("🔄 Running migration...");
    const migrationSql = fs.readFileSync(path.join(__dirname, "migration.sql"), "utf8");
    await client.query(migrationSql);
    console.log("✅ Migration completed — all tables created.");

    // 2. Hash passwords
    const rounds = 10;
    const adminHash = await bcrypt.hash("admin123", rounds);
    const userHash = await bcrypt.hash("user123", rounds);

    // 3. Seed users
    console.log("🌱 Seeding users...");

    await client.query(
      `INSERT INTO users (username, password_hash, email, full_name, role, position, department, phone_number)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (username) DO UPDATE SET
         password_hash = EXCLUDED.password_hash,
         email = EXCLUDED.email,
         full_name = EXCLUDED.full_name,
         role = EXCLUDED.role,
         position = EXCLUDED.position,
         department = EXCLUDED.department,
         phone_number = EXCLUDED.phone_number`,
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
       ON CONFLICT (username) DO UPDATE SET
         password_hash = EXCLUDED.password_hash,
         email = EXCLUDED.email,
         full_name = EXCLUDED.full_name,
         role = EXCLUDED.role,
         position = EXCLUDED.position,
         department = EXCLUDED.department,
         phone_number = EXCLUDED.phone_number`,
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

    console.log("\n🎉 Database ready! Start with: npm run dev");
  } catch (err) {
    console.error("❌ Migration failed:", err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

run();