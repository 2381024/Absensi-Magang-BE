const pool = require("../config/db");

const getGeofences = async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 10));
    const offset = (page - 1) * limit;

    const [geofencesResult, countResult] = await Promise.all([
      pool.query(
        `SELECT id, name, latitude, longitude, radius_meters, is_active, created_by, created_at, updated_at
         FROM geofence_locations
         ORDER BY created_at DESC
         LIMIT $1 OFFSET $2`,
         [limit, offset]
      ),
      pool.query(`SELECT COUNT(*) AS total FROM geofence_locations`)
    ]);

    const total = Number(countResult.rows[0].total);

    res.json({
      success: true,
      data: geofencesResult.rows,
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

const createGeofence = async (req, res, next) => {
  try {
    const { name, latitude, longitude, radius_meters, is_active = true } = req.body;
    if (!name || latitude === undefined || longitude === undefined || radius_meters === undefined) {
      return res.status(400).json({
        error: { message: "name, latitude, longitude, radius_meters wajib diisi", status: 400 },
      });
    }

    const { rows } = await pool.query(
      `INSERT INTO geofence_locations (name, latitude, longitude, radius_meters, is_active, created_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, name, latitude, longitude, radius_meters, is_active, created_by, created_at, updated_at`,
      [name, latitude, longitude, radius_meters, is_active, req.user.id]
    );

    res.status(201).json({ success: true, data: rows[0] });
  } catch (err) {
    next(err);
  }
};

const updateGeofence = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, latitude, longitude, radius_meters, is_active } = req.body;
    const updates = [];
    const values = [];

    if (name !== undefined) {
      values.push(name);
      updates.push(`name = $${values.length}`);
    }
    if (latitude !== undefined) {
      values.push(latitude);
      updates.push(`latitude = $${values.length}`);
    }
    if (longitude !== undefined) {
      values.push(longitude);
      updates.push(`longitude = $${values.length}`);
    }
    if (radius_meters !== undefined) {
      values.push(radius_meters);
      updates.push(`radius_meters = $${values.length}`);
    }
    if (is_active !== undefined) {
      values.push(is_active);
      updates.push(`is_active = $${values.length}`);
    }

    if (updates.length === 0) {
      return res.status(400).json({
        error: { message: "Tidak ada field yang diubah", status: 400 },
      });
    }

    values.push(id);
    const { rows } = await pool.query(
      `UPDATE geofence_locations SET ${updates.join(", ")}, updated_at = NOW()
       WHERE id = $${values.length}
       RETURNING id, name, latitude, longitude, radius_meters, is_active, created_by, created_at, updated_at`,
      values
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: { message: "Geofence tidak ditemukan", status: 404 } });
    }

    res.json({ success: true, data: rows[0] });
  } catch (err) {
    next(err);
  }
};

const deleteGeofence = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { rowCount } = await pool.query("DELETE FROM geofence_locations WHERE id = $1", [id]);
    if (rowCount === 0) {
      return res.status(404).json({ error: { message: "Geofence tidak ditemukan", status: 404 } });
    }
    res.json({ success: true, data: { id } });
  } catch (err) {
    next(err);
  }
};

const toggleGeofence = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { rows } = await pool.query(
      `UPDATE geofence_locations
       SET is_active = NOT is_active, updated_at = NOW()
       WHERE id = $1
       RETURNING id, name, latitude, longitude, radius_meters, is_active, created_by, created_at, updated_at`,
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: { message: "Geofence tidak ditemukan", status: 404 } });
    }
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getGeofences,
  createGeofence,
  updateGeofence,
  deleteGeofence,
  toggleGeofence,
};
