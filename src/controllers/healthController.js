const pool = require("../config/db");

const getHealth = async (req, res, next) => {
  try {
    const result = await pool.query("SELECT NOW()");
    res.json({
      success: true,
      data: {
        status: "ok",
        message: "Server is running",
        dbTime: result.rows[0].now,
      },
    });
  } catch (err) {
    next(err);
  }
};

module.exports = { getHealth };
