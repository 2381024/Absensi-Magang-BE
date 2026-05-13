const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const pool = require("../config/db");

const login = async (req, res, next) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({
        error: { message: "Username dan password wajib diisi", status: 400 },
      });
    }

    const { rows } = await pool.query(
      `SELECT id, username, password_hash, full_name, role, position, department, email, avatar_url, is_active
       FROM users
       WHERE username = $1`,
      [username]
    );

    const user = rows[0];
    if (!user || !user.is_active) {
      return res.status(401).json({
        error: { message: "Username atau password salah", status: 401 },
      });
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({
        error: { message: "Username atau password salah", status: 401 },
      });
    }

    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "8h" }
    );

    const safeUser = {
      id: user.id,
      username: user.username,
      full_name: user.full_name,
      role: user.role,
      position: user.position,
      department: user.department,
      email: user.email,
      avatar_url: user.avatar_url,
    };

    res.json({ success: true, data: { token, user: safeUser } });
  } catch (err) {
    next(err);
  }
};

const logout = async (req, res) => {
  res.json({ success: true, data: { message: "Logout berhasil" } });
};

const getMe = async (req, res, next) => {
  try {
    const { id } = req.user;
    const { rows } = await pool.query(
      `SELECT id, username, full_name, role, position, department, email, phone_number, avatar_url, is_active
       FROM users
       WHERE id = $1`,
      [id]
    );

    const user = rows[0];
    if (!user) {
      return res.status(404).json({
        error: { message: "User tidak ditemukan", status: 404 },
      });
    }

    res.json({ success: true, data: { user } });
  } catch (err) {
    next(err);
  }
};

module.exports = { login, logout, getMe };
