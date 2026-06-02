const bcrypt = require("bcrypt");
const pool = require("../config/db");

const getAllUsers = async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const offset = (page - 1) * limit;

    // Get paginated users + total count in parallel
    const [usersResult, countResult] = await Promise.all([
      pool.query(
        `SELECT id, username, full_name, role, position, department, email, phone_number, avatar_url, is_active, created_at, updated_at
         FROM users
         ORDER BY created_at DESC
         LIMIT $1 OFFSET $2`,
        [limit, offset]
      ),
      pool.query(`SELECT COUNT(*) AS total FROM users`),
    ]);

    const total = Number(countResult.rows[0].total);

    res.json({
      success: true,
      data: usersResult.rows,
      pagination: {
        page,
        limit,
        total,
        total_pages: Math.ceil(total / limit),
      },
    });
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

    if (req.user.id === id) {
      return res.status(403).json({
        error: { message: "Tidak dapat menghapus akun sendiri", status: 403 },
      });
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        "UPDATE geofence_locations SET created_by = NULL WHERE created_by = $1",
        [id]
      );
      const { rowCount } = await client.query("DELETE FROM users WHERE id = $1", [id]);
      await client.query("COMMIT");

      if (rowCount === 0) {
        return res.status(404).json({ error: { message: "User tidak ditemukan", status: 404 } });
      }

      res.json({ success: true, data: { id } });
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error("Delete user error:", err);
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