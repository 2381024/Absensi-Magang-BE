const pool = require("../config/db");

// GET /api/users/:id/assignments
// Returns all geofences assigned to this user (active or not, so admin can see history).
const getUserAssignments = async (req, res, next) => {
  try {
    const { id } = req.params;

    const userExists = await pool.query("SELECT id FROM users WHERE id = $1", [id]);
    if (userExists.rows.length === 0) {
      return res.status(404).json({ error: { message: "User tidak ditemukan", status: 404 } });
    }

    const { rows } = await pool.query(
      `SELECT g.id, g.name, g.latitude, g.longitude, g.radius_meters, g.is_active,
              a.assigned_at, a.assigned_by
       FROM user_geofence_assignments a
       JOIN geofence_locations g ON g.id = a.geofence_id
       WHERE a.user_id = $1
       ORDER BY a.assigned_at DESC`,
      [id]
    );

    res.json({ success: true, data: rows });
  } catch (err) {
    next(err);
  }
};

// PUT /api/users/:id/assignments
// Replaces the full assignment set: body { geofence_ids: string[] }.
// Idempotent: missing IDs are deleted; new IDs are inserted; existing IDs untouched.
// Validates that every provided ID actually exists in geofence_locations.
const replaceUserAssignments = async (req, res, next) => {
  const { id } = req.params;
  const { geofence_ids } = req.body;

  if (!Array.isArray(geofence_ids)) {
    return res.status(400).json({
      error: { message: "geofence_ids wajib berupa array", status: 400 },
    });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const userExists = await client.query("SELECT id FROM users WHERE id = $1", [id]);
    if (userExists.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: { message: "User tidak ditemukan", status: 404 } });
    }

    const uniqueIds = [...new Set(geofence_ids.filter((g) => typeof g === "string" && g.length > 0))];

    if (uniqueIds.length > 0) {
      const placeholders = uniqueIds.map((_, i) => `$${i + 1}`).join(",");
      const validate = await client.query(
        `SELECT id FROM geofence_locations WHERE id IN (${placeholders})`,
        uniqueIds
      );
      if (validate.rows.length !== uniqueIds.length) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          error: { message: "Satu atau lebih geofence_id tidak valid", status: 400 },
        });
      }
    }

    await client.query("DELETE FROM user_geofence_assignments WHERE user_id = $1", [id]);

    for (const geoId of uniqueIds) {
      await client.query(
        `INSERT INTO user_geofence_assignments (user_id, geofence_id, assigned_by)
         VALUES ($1, $2, $3)`,
        [id, geoId, req.user.id]
      );
    }

    const { rows } = await client.query(
      `SELECT g.id, g.name, g.latitude, g.longitude, g.radius_meters, g.is_active,
              a.assigned_at, a.assigned_by
       FROM user_geofence_assignments a
       JOIN geofence_locations g ON g.id = a.geofence_id
       WHERE a.user_id = $1
       ORDER BY a.assigned_at DESC`,
      [id]
    );

    await client.query("COMMIT");
    res.json({ success: true, data: rows });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    next(err);
  } finally {
    client.release();
  }
};

module.exports = {
  getUserAssignments,
  replaceUserAssignments,
};