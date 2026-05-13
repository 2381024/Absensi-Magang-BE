const pool = require("../config/db");

const getConfig = async (req, res, next) => {
  try {
    const { rows } = await pool.query("SELECT key, value FROM system_config");
    const config = rows.reduce((acc, item) => {
      acc[item.key] = item.value;
      return acc;
    }, {});

    res.json({ success: true, data: config });
  } catch (err) {
    next(err);
  }
};

const updateConfig = async (req, res, next) => {
  try {
    const changes = req.body;
    const keys = Object.keys(changes);
    if (keys.length === 0) {
      return res.status(400).json({
        error: { message: "Tidak ada konfigurasi yang dikirim", status: 400 },
      });
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      for (const key of keys) {
        await client.query(
          `INSERT INTO system_config (key, value) VALUES ($1, $2)
           ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
          [key, String(changes[key])]
        );
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }

    const { rows } = await pool.query("SELECT key, value FROM system_config");
    const config = rows.reduce((acc, item) => {
      acc[item.key] = item.value;
      return acc;
    }, {});

    res.json({ success: true, data: config });
  } catch (err) {
    next(err);
  }
};

module.exports = { getConfig, updateConfig };
