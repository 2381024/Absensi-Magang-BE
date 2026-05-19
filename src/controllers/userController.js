const bcrypt = require("bcrypt");
const pool = require("../config/db");

const getAllUsers = async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, username, full_name, role, position, department, email, phone_number, avatar_url, is_active, created_at, updated_at
       FROM users ORDER BY created_at DESC`
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    next(err);
  }
};

const getUserById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { rows } = await pool.query(
      `SELECT id, username, full_name, role, position, department, email, phone_number, avatar_url, is_active, created_at, updated_at
       FROM users WHERE id = $1`,
      [id]
    );

    if (!rows[0]) {
      return res.status(404).json({ error: { message: "User tidak ditemukan", status: 404 } });
    }

    res.json({ success: true, data: rows[0] });
  } catch (err) {
    next(err);
  }
};

const createUser = async (req, res, next) => {
  try {
    const {
      username,
      password,
      email,
      full_name,
      role = "user",
      position,
      department,
      phone_number,
      avatar_url,
    } = req.body;

    if (!username || !password || !email || !full_name) {
      return res.status(400).json({
        error: { message: "username, password, email, full_name wajib diisi", status: 400 },
      });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const { rows } = await pool.query(
      `INSERT INTO users (username, password_hash, email, full_name, role, position, department, phone_number, avatar_url)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id, username, full_name, role, position, department, email, phone_number, avatar_url, is_active, created_at, updated_at`,
      [username, passwordHash, email, full_name, role, position, department, phone_number, avatar_url]
    );

    res.status(201).json({ success: true, data: rows[0] });
  } catch (err) {
    if (err.code === "23505") {
      return res.status(409).json({
        error: { message: "Username atau email sudah terdaftar", status: 409 },
      });
    }
    next(err);
  }
};

const updateUser = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { password, full_name, role, position, department, phone_number, avatar_url, email, is_active } = req.body;
    const updates = [];
    const values = [];

    if (password !== undefined) {
      const passwordHash = await bcrypt.hash(password, 10);
      values.push(passwordHash);
      updates.push(`password_hash = $${values.length}`);
    }
    if (full_name !== undefined) {
      values.push(full_name);
      updates.push(`full_name = $${values.length}`);
    }
    if (role !== undefined) {
      values.push(role);
      updates.push(`role = $${values.length}`);
    }
    if (position !== undefined) {
      values.push(position);
      updates.push(`position = $${values.length}`);
    }
    if (department !== undefined) {
      values.push(department);
      updates.push(`department = $${values.length}`);
    }
    if (phone_number !== undefined) {
      values.push(phone_number);
      updates.push(`phone_number = $${values.length}`);
    }
    if (avatar_url !== undefined) {
      values.push(avatar_url);
      updates.push(`avatar_url = $${values.length}`);
    }
    if (email !== undefined) {
      values.push(email);
      updates.push(`email = $${values.length}`);
    }
    if (is_active !== undefined) {
      values.push(is_active);
      updates.push(`is_active = $${values.length}`);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: { message: "Tidak ada data yang diubah", status: 400 } });
    }

    values.push(id);
    const { rows } = await pool.query(
      `UPDATE users SET ${updates.join(", ")}, updated_at = NOW() WHERE id = $${values.length}
       RETURNING id, username, full_name, role, position, department, email, phone_number, avatar_url, is_active, created_at, updated_at`,
      values
    );

    if (!rows[0]) {
      return res.status(404).json({ error: { message: "User tidak ditemukan", status: 404 } });
    }
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    if (err.code === "23505") {
      return res.status(409).json({ error: { message: "Username atau email sudah terdaftar", status: 409 } });
    }
    next(err);
  }
};

const deleteUser = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { rows, rowCount } = await pool.query(
      `UPDATE users SET is_active = false, updated_at = NOW() WHERE id = $1 RETURNING id`,
      [id]
    );
    if (rowCount === 0) {
      return res.status(404).json({ error: { message: "User tidak ditemukan", status: 404 } });
    }
    res.json({ success: true, data: { id } });
  } catch (err) {
    next(err);
  }
};

const uploadUserAvatar = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!req.file) {
      return res.status(400).json({ error: { message: "File gambar wajib diunggah", status: 400 } });
    }

    // construct public URL
    const avatarUrl = `/uploads/profiles/${req.file.filename}`;

    const { rows } = await pool.query(
      `UPDATE users SET avatar_url = $1, updated_at = NOW() WHERE id = $2 RETURNING avatar_url`,
      [avatarUrl, id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: { message: "User tidak ditemukan", status: 404 } });
    }

    res.json({ success: true, data: { avatar_url: rows[0].avatar_url } });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getAllUsers,
  getUserById,
  createUser,
  updateUser,
  deleteUser,
  uploadUserAvatar,
};
