const pool = require("../config/db");

const submitLeave = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { type, start_date, end_date, reason } = req.body;

    if (!type || !start_date || !end_date || !reason) {
      return res.status(400).json({ error: { message: "type, start_date, end_date, reason wajib", status: 400 } });
    }
    if (!['izin', 'sakit', 'cuti'].includes(type)) {
      return res.status(400).json({ error: { message: "type harus izin, sakit, atau cuti", status: 400 } });
    }
    if (new Date(start_date) > new Date(end_date)) {
      return res.status(400).json({ error: { message: "start_date tidak boleh lebih dari end_date", status: 400 } });
    }

    const { rows } = await pool.query(
      `INSERT INTO leave_requests (user_id, type, start_date, end_date, reason)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [userId, type, start_date, end_date, reason]
    );

    res.status(201).json({ success: true, data: rows[0] });
  } catch (err) {
    next(err);
  }
};

const getMyLeaves = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { type, status } = req.query;

    let query = `SELECT lr.*, u.full_name AS user_name
                 FROM leave_requests lr
                 JOIN users u ON u.id = lr.user_id
                 WHERE lr.user_id = $1`;
    const params = [userId];
    let idx = 2;

    if (type) {
      query += ` AND lr.type = $${idx++}`;
      params.push(type);
    }
    if (status) {
      query += ` AND lr.status = $${idx++}`;
      params.push(status);
    }

    query += ` ORDER BY lr.created_at DESC`;

    const { rows } = await pool.query(query, params);
    res.json({ success: true, data: rows });
  } catch (err) {
    next(err);
  }
};

const deleteMyLeave = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const { rows } = await pool.query(
      `DELETE FROM leave_requests WHERE id = $1 AND user_id = $2 AND status = 'pending' RETURNING id`,
      [id, userId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: { message: "Izin tidak ditemukan atau sudah diproses", status: 404 } });
    }

    res.json({ success: true, data: { id } });
  } catch (err) {
    next(err);
  }
};

const getAllLeaves = async (req, res, next) => {
  try {
    const { type, status } = req.query;

    let query = `SELECT lr.*, u.full_name AS user_name
                 FROM leave_requests lr
                 JOIN users u ON u.id = lr.user_id
                 WHERE 1=1`;
    const params = [];
    let idx = 1;

    if (type) {
      query += ` AND lr.type = $${idx++}`;
      params.push(type);
    }
    if (status) {
      query += ` AND lr.status = $${idx++}`;
      params.push(status);
    }

    query += ` ORDER BY lr.created_at DESC`;

    const { rows } = await pool.query(query, params);
    res.json({ success: true, data: rows });
  } catch (err) {
    next(err);
  }
};

const approveLeave = async (req, res, next) => {
  try {
    const adminId = req.user.id;
    const { id } = req.params;
    const { reviewer_notes } = req.body || {};

    const { rows } = await pool.query(
      `UPDATE leave_requests
       SET status = 'approved', reviewed_by = $1, reviewed_at = NOW(), reviewer_notes = COALESCE($2, reviewer_notes), updated_at = NOW()
       WHERE id = $3 AND status = 'pending'
       RETURNING *`,
      [adminId, reviewer_notes, id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: { message: "Izin tidak ditemukan atau sudah diproses", status: 404 } });
    }

    res.json({ success: true, data: rows[0] });
  } catch (err) {
    next(err);
  }
};

const rejectLeave = async (req, res, next) => {
  try {
    const adminId = req.user.id;
    const { id } = req.params;
    const { reviewer_notes } = req.body || {};

    if (!reviewer_notes) {
      return res.status(400).json({ error: { message: "reviewer_notes wajib untuk menolak", status: 400 } });
    }

    const { rows } = await pool.query(
      `UPDATE leave_requests
       SET status = 'rejected', reviewed_by = $1, reviewed_at = NOW(), reviewer_notes = $2, updated_at = NOW()
       WHERE id = $3 AND status = 'pending'
       RETURNING *`,
      [adminId, reviewer_notes, id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: { message: "Izin tidak ditemukan atau sudah diproses", status: 404 } });
    }

    res.json({ success: true, data: rows[0] });
  } catch (err) {
    next(err);
  }
};

const getPendingCount = async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT COUNT(*) AS count FROM leave_requests WHERE status = 'pending'`
    );
    res.json({ success: true, data: { pending_leaves: Number(rows[0].count) } });
  } catch (err) {
    next(err);
  }
};

module.exports = { submitLeave, getMyLeaves, deleteMyLeave, getAllLeaves, approveLeave, rejectLeave, getPendingCount };
