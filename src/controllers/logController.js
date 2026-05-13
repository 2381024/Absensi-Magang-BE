const pool = require("../config/db");
const { getDistanceMeters } = require("../utils/haversine");

const calculateMinutes = (start, end, breakMinutes) => {
  const diff = Math.max(0, end.getTime() - start.getTime());
  const total = Math.round(diff / 60000) - Number(breakMinutes || 0);
  return total >= 0 ? total : 0;
};

const startShift = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { latitude, longitude } = req.body;

    const conflict = await pool.query(
      `SELECT id FROM work_logs WHERE user_id = $1 AND date = CURRENT_DATE AND status = 'active'`,
      [userId]
    );
    if (conflict.rows.length > 0) {
      return res.status(409).json({
        error: { message: "Shift hari ini sudah aktif", status: 409 },
      });
    }

    const configResult = await pool.query(
      `SELECT value FROM system_config WHERE key = 'break_minutes_default'`
    );
    const breakMinutes = configResult.rows[0]
      ? Number(configResult.rows[0].value)
      : 30;

    const geofenceResult = await pool.query(
      `SELECT id, latitude, longitude, radius_meters FROM geofence_locations WHERE is_active = true`);
    let geofencePassed = null;
    let startLat = null;
    let startLng = null;

    if (geofenceResult.rows.length > 0) {
      if (latitude === undefined || longitude === undefined) {
        return res.status(400).json({
          error: { message: "Latitude dan longitude wajib ketika geofence aktif", status: 400 },
        });
      }

      const isInside = geofenceResult.rows.some((location) => {
        const distance = getDistanceMeters(
          Number(latitude),
          Number(longitude),
          Number(location.latitude),
          Number(location.longitude)
        );
        return distance <= Number(location.radius_meters);
      });

      if (!isInside) {
        return res.status(403).json({
          error: { message: "Lokasi Anda berada di luar area geofence aktif", status: 403 },
        });
      }

      geofencePassed = true;
      startLat = latitude;
      startLng = longitude;
    }

    const { rows } = await pool.query(
      `INSERT INTO work_logs (user_id, date, start_time, break_minutes, geofence_passed, start_lat, start_lng)
       VALUES ($1, CURRENT_DATE, NOW(), $2, $3, $4, $5)
       RETURNING id, date, start_time, status, geofence_passed, break_minutes`,
      [userId, breakMinutes, geofencePassed, startLat, startLng]
    );

    res.status(201).json({ success: true, data: rows[0] });
  } catch (err) {
    next(err);
  }
};

const finishShift = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const { description, end_latitude, end_longitude } = req.body;

    const { rows } = await pool.query(
      `SELECT * FROM work_logs WHERE id = $1 AND user_id = $2`,
      [id, userId]
    );
    const log = rows[0];
    if (!log) {
      return res.status(404).json({ error: { message: "Log tidak ditemukan", status: 404 } });
    }
    if (log.status !== "active") {
      return res.status(409).json({ error: { message: "Shift sudah selesai atau tidak aktif", status: 409 } });
    }

    const startTime = new Date(log.start_time);
    const endTime = new Date();
    const totalMinutes = calculateMinutes(startTime, endTime, log.break_minutes);

    const updated = await pool.query(
      `UPDATE work_logs
       SET end_time = NOW(), description = $1, status = 'completed', total_work_minutes = $2,
           end_lat = $3, end_lng = $4, updated_at = NOW()
       WHERE id = $5
       RETURNING id, date, start_time, end_time, break_minutes, total_work_minutes, status, description, geofence_passed`,
      [description || log.description, totalMinutes, end_latitude, end_longitude, id]
    );

    res.json({ success: true, data: updated.rows[0] });
  } catch (err) {
    next(err);
  }
};

const getTodayLog = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { rows } = await pool.query(
      `SELECT id, date, start_time, end_time, break_minutes, total_work_minutes, status, geofence_passed
       FROM work_logs
       WHERE user_id = $1 AND date = CURRENT_DATE
       ORDER BY created_at DESC
       LIMIT 1`,
      [userId]
    );
    res.json({ success: true, data: rows[0] || null });
  } catch (err) {
    next(err);
  }
};

const getLogs = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { month, year } = req.query;
    if (!month || !year) {
      return res.status(400).json({
        error: { message: "Query parameter month dan year wajib", status: 400 },
      });
    }

    const { rows } = await pool.query(
      `SELECT id, date, start_time, end_time, break_minutes, total_work_minutes, description, status, geofence_passed
       FROM work_logs
       WHERE user_id = $1 AND EXTRACT(MONTH FROM date) = $2 AND EXTRACT(YEAR FROM date) = $3
       ORDER BY date DESC`,
      [userId, Number(month), Number(year)]
    );

    res.json({ success: true, data: rows });
  } catch (err) {
    next(err);
  }
};

const getLogSummary = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { month, year } = req.query;
    if (!month || !year) {
      return res.status(400).json({
        error: { message: "Query parameter month dan year wajib", status: 400 },
      });
    }

    const logsResult = await pool.query(
      `SELECT id, date, start_time, end_time, break_minutes, total_work_minutes, description, status, geofence_passed
       FROM work_logs
       WHERE user_id = $1 AND EXTRACT(MONTH FROM date) = $2 AND EXTRACT(YEAR FROM date) = $3
       ORDER BY date DESC`,
      [userId, Number(month), Number(year)]
    );

    const summaryResult = await pool.query(
      `SELECT COUNT(*) AS total_days, COALESCE(SUM(total_work_minutes), 0) AS total_work_minutes
       FROM work_logs
       WHERE user_id = $1 AND EXTRACT(MONTH FROM date) = $2 AND EXTRACT(YEAR FROM date) = $3`,
      [userId, Number(month), Number(year)]
    );

    const totalDays = Number(summaryResult.rows[0].total_days);
    const totalWorkMinutes = Number(summaryResult.rows[0].total_work_minutes);
    const averageHoursPerDay = totalDays > 0 ? Number((totalWorkMinutes / 60 / totalDays).toFixed(2)) : 0;

    res.json({
      success: true,
      data: {
        total_days: totalDays,
        total_work_minutes: totalWorkMinutes,
        total_work_hours: Number((totalWorkMinutes / 60).toFixed(2)),
        average_hours_per_day: averageHoursPerDay,
        logs: logsResult.rows,
      },
    });
  } catch (err) {
    next(err);
  }
};

const getLogById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { rows } = await pool.query(
      `SELECT wl.id, wl.date, wl.start_time, wl.end_time, wl.break_minutes, wl.total_work_minutes,
              wl.description, wl.status, wl.geofence_passed,
              json_build_object('id', u.id, 'full_name', u.full_name) AS user
       FROM work_logs wl
       JOIN users u ON u.id = wl.user_id
       WHERE wl.id = $1`,
      [id]
    );
    const log = rows[0];
    if (!log) {
      return res.status(404).json({ error: { message: "Log tidak ditemukan", status: 404 } });
    }

    if (req.user.role !== "admin" && req.user.id !== log.user.id) {
      return res.status(403).json({ error: { message: "Akses ditolak", status: 403 } });
    }

    const entriesResult = await pool.query(
      `SELECT id, content, timestamp FROM work_log_entries WHERE work_log_id = $1 ORDER BY timestamp ASC`,
      [id]
    );

    log.entries = entriesResult.rows;
    res.json({ success: true, data: log });
  } catch (err) {
    next(err);
  }
};

const getAllLogs = async (req, res, next) => {
  try {
    const { user_id, month, year, status } = req.query;
    if (!month || !year) {
      return res.status(400).json({
        error: { message: "Query parameter month dan year wajib", status: 400 },
      });
    }

    const conditions = ["EXTRACT(MONTH FROM date) = $1", "EXTRACT(YEAR FROM date) = $2"];
    const values = [Number(month), Number(year)];

    if (user_id) {
      values.push(user_id);
      conditions.push(`user_id = $${values.length}`);
    }
    if (status) {
      values.push(status);
      conditions.push(`status = $${values.length}`);
    }

    const query = `SELECT id, user_id, date, start_time, end_time, break_minutes, total_work_minutes, description, status, geofence_passed
                   FROM work_logs
                   WHERE ${conditions.join(" AND ")}
                   ORDER BY date DESC, start_time DESC`;

    const { rows } = await pool.query(query, values);
    res.json({ success: true, data: rows });
  } catch (err) {
    next(err);
  }
};

const adminUpdateLog = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { start_time, end_time, description } = req.body;

    const { rows } = await pool.query(`SELECT * FROM work_logs WHERE id = $1`, [id]);
    const log = rows[0];
    if (!log) {
      return res.status(404).json({ error: { message: "Log tidak ditemukan", status: 404 } });
    }

    const fields = [];
    const values = [];
    if (start_time !== undefined) {
      values.push(start_time);
      fields.push(`start_time = $${values.length}`);
    }
    if (end_time !== undefined) {
      values.push(end_time);
      fields.push(`end_time = $${values.length}`);
    }
    if (description !== undefined) {
      values.push(description);
      fields.push(`description = $${values.length}`);
    }

    if (fields.length === 0) {
      return res.status(400).json({ error: { message: "Tidak ada perubahan yang dikirim", status: 400 } });
    }

    const mergedStart = start_time ? new Date(start_time) : new Date(log.start_time);
    const mergedEnd = end_time ? new Date(end_time) : log.end_time ? new Date(log.end_time) : null;
    let totalWorkMinutes = log.total_work_minutes;
    if (mergedEnd) {
      totalWorkMinutes = calculateMinutes(mergedStart, mergedEnd, log.break_minutes);
      fields.push(`total_work_minutes = $${values.length + 1}`);
      values.push(totalWorkMinutes);
    }

    values.push(id);
    const updated = await pool.query(
      `UPDATE work_logs SET ${fields.join(", ")}, updated_at = NOW() WHERE id = $${values.length} RETURNING *`,
      values
    );

    res.json({ success: true, data: updated.rows[0] });
  } catch (err) {
    next(err);
  }
};

const patchLogBreak = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { break_minutes } = req.body;
    if (break_minutes === undefined) {
      return res.status(400).json({ error: { message: "Field break_minutes wajib", status: 400 } });
    }

    const { rows } = await pool.query(`SELECT * FROM work_logs WHERE id = $1`, [id]);
    const log = rows[0];
    if (!log) {
      return res.status(404).json({ error: { message: "Log tidak ditemukan", status: 404 } });
    }

    let totalMinutes = log.total_work_minutes;
    if (log.end_time) {
      totalMinutes = calculateMinutes(new Date(log.start_time), new Date(log.end_time), break_minutes);
    }

    const { rows: updatedRows } = await pool.query(
      `UPDATE work_logs SET break_minutes = $1, total_work_minutes = $2, updated_at = NOW() WHERE id = $3 RETURNING *`,
      [break_minutes, totalMinutes, id]
    );

    res.json({ success: true, data: updatedRows[0] });
  } catch (err) {
    next(err);
  }
};

const deleteLog = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { rowCount } = await pool.query(`DELETE FROM work_logs WHERE id = $1`, [id]);
    if (rowCount === 0) {
      return res.status(404).json({ error: { message: "Log tidak ditemukan", status: 404 } });
    }
    res.json({ success: true, data: { id } });
  } catch (err) {
    next(err);
  }
};

const addLogEntry = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const { content } = req.body;
    if (!content) {
      return res.status(400).json({ error: { message: "Content wajib diisi", status: 400 } });
    }

    const { rows } = await pool.query(`SELECT * FROM work_logs WHERE id = $1 AND user_id = $2`, [id, userId]);
    const log = rows[0];
    if (!log) {
      return res.status(404).json({ error: { message: "Log tidak ditemukan", status: 404 } });
    }
    if (log.status !== "active") {
      return res.status(409).json({ error: { message: "Hanya dapat menambahkan entry pada shift aktif", status: 409 } });
    }

    const { rows: entryRows } = await pool.query(
      `INSERT INTO work_log_entries (work_log_id, content) VALUES ($1, $2) RETURNING id, content, timestamp`,
      [id, content]
    );

    res.status(201).json({ success: true, data: entryRows[0] });
  } catch (err) {
    next(err);
  }
};

const getLogEntries = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const { rows } = await pool.query(`SELECT * FROM work_logs WHERE id = $1`, [id]);
    const log = rows[0];
    if (!log) {
      return res.status(404).json({ error: { message: "Log tidak ditemukan", status: 404 } });
    }
    if (req.user.role !== "admin" && req.user.id !== log.user_id) {
      return res.status(403).json({ error: { message: "Akses ditolak", status: 403 } });
    }

    const { rows: entries } = await pool.query(
      `SELECT id, content, timestamp FROM work_log_entries WHERE work_log_id = $1 ORDER BY timestamp ASC`,
      [id]
    );

    res.json({ success: true, data: entries });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  startShift,
  finishShift,
  getTodayLog,
  getLogs,
  getLogSummary,
  getLogById,
  getAllLogs,
  adminUpdateLog,
  patchLogBreak,
  deleteLog,
  addLogEntry,
  getLogEntries,
};
