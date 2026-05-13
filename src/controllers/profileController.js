const bcrypt = require("bcrypt");
const pool = require("../config/db");

const getProfile = async (req, res, next) => {
  try {
    const { id } = req.user;
    const { rows } = await pool.query(
      `SELECT id, username, full_name, role, position, department, email, phone_number, avatar_url, is_active
       FROM users WHERE id = $1`,
      [id]
    );

    if (!rows[0]) {
      return res.status(404).json({ error: { message: "User tidak ditemukan", status: 404 } });
    }

    res.json({ success: true, data: { user: rows[0] } });
  } catch (err) {
    next(err);
  }
};

const updateProfile = async (req, res, next) => {
  try {
    const { id } = req.user;
    const { full_name, email, phone_number, position, department, avatar_url, current_password, new_password } = req.body;

    const { rows } = await pool.query(`SELECT password_hash FROM users WHERE id = $1`, [id]);
    const user = rows[0];
    if (!user) {
      return res.status(404).json({ error: { message: "User tidak ditemukan", status: 404 } });
    }

    const updates = [];
    const values = [];

    if (full_name !== undefined) {
      values.push(full_name);
      updates.push(`full_name = $${values.length}`);
    }
    if (email !== undefined) {
      values.push(email);
      updates.push(`email = $${values.length}`);
    }
    if (phone_number !== undefined) {
      values.push(phone_number);
      updates.push(`phone_number = $${values.length}`);
    }
    if (position !== undefined) {
      values.push(position);
      updates.push(`position = $${values.length}`);
    }
    if (department !== undefined) {
      values.push(department);
      updates.push(`department = $${values.length}`);
    }
    if (avatar_url !== undefined) {
      values.push(avatar_url);
      updates.push(`avatar_url = $${values.length}`);
    }

    if (new_password !== undefined) {
      if (!current_password) {
        return res.status(400).json({ error: { message: "current_password wajib untuk mengubah password", status: 400 } });
      }
      const isMatch = await bcrypt.compare(current_password, user.password_hash);
      if (!isMatch) {
        return res.status(401).json({ error: { message: "Password saat ini tidak cocok", status: 401 } });
      }
      const passwordHash = await bcrypt.hash(new_password, 10);
      values.push(passwordHash);
      updates.push(`password_hash = $${values.length}`);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: { message: "Tidak ada data profil yang diubah", status: 400 } });
    }

    values.push(id);
    const { rows: updatedRows } = await pool.query(
      `UPDATE users SET ${updates.join(", ")}, updated_at = NOW() WHERE id = $${values.length} RETURNING id, username, full_name, role, position, department, email, phone_number, avatar_url, is_active`,
      values
    );

    res.json({ success: true, data: { user: updatedRows[0] } });
  } catch (err) {
    next(err);
  }
};

module.exports = { getProfile, updateProfile };
