const jwt = require("jsonwebtoken");
const pool = require("../config/db");

const authMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: { message: "Token tidak ditemukan", status: 401 } });
    }

    const token = authHeader.split(" ")[1];
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const { rows } = await pool.query(
      `SELECT id, username, full_name, role, email, is_active FROM users WHERE id = $1`,
      [payload.id]
    );

    const user = rows[0];
    if (!user || !user.is_active) {
      return res.status(401).json({ error: { message: "Token tidak valid atau user tidak aktif", status: 401 } });
    }

    req.user = {
      id: user.id,
      username: user.username,
      full_name: user.full_name,
      role: user.role,
      email: user.email,
    };
    next();
  } catch (err) {
    return res.status(401).json({ error: { message: "Token tidak valid", status: 401 } });
  }
};

module.exports = authMiddleware;
