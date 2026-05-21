const pool = require("../config/db");
const { getDistanceMeters } = require("../utils/haversine");

const calculateMinutes = (start, end) => {
  const diff = Math.max(0, end.getTime() - start.getTime());
  return Math.round(diff / 60000);
};

// Helper: get today's day of week (0=Sunday, 6=Saturday)
const getTodayDayOfWeek = () => new Date().getDay();

// Helper: parse a TIME string (HH:MM:SS or HH:MM) into today's Date for comparison
const timeToTodayDate = (timeStr) => {
  if (!timeStr) return null;
  const parts = timeStr.split(":");
  const d = new Date();
  d.setHours(Number(parts[0]), Number(parts[1]), parts[2] ? Number(parts[2]) : 0, 0);
  return d;
};

const startShift = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { latitude, longitude, late_reason } = req.body;

    const todayLog = await pool.query(
      `SELECT id, status, date FROM work_logs 
       WHERE user_id = $1 AND (status = 'active' OR date = CURRENT_DATE)
       ORDER BY status ASC
       LIMIT 1`,
      [userId]
    );
    if (todayLog.rows.length > 0) {
      const existing = todayLog.rows[0];
      const message = existing.status === 'active'
        ? "Anda masih memiliki shift yang sedang aktif"
        : "Shift hari ini sudah selesai";
      return res.status(409).json({
        error: { message, status: 409 },
      });
    }

    // Look up today's schedule
    const dayOfWeek = getTodayDayOfWeek();
    const scheduleResult = await pool.query(
      `SELECT start_time, end_time FROM user_schedules WHERE user_id = $1 AND day_of_week = $2`,
      [userId, dayOfWeek]
    );
    const schedule = scheduleResult.rows[0] || null;

    let scheduledStart = null;
    let scheduledEnd = null;
    let isLate = false;

    if (schedule) {
      scheduledStart = schedule.start_time;
      scheduledEnd = schedule.end_time;

      const schedStartDate = timeToTodayDate(scheduledStart);
      const now = new Date();

      if (now > schedStartDate) {
        isLate = true;
        // Require late reason
        if (!late_reason || !late_reason.trim()) {
          return res.status(400).json({
            error: { message: "Alasan terlambat wajib diisi", status: 400 },
          });
        }
      }
    }

    // Geofence check
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
      `INSERT INTO work_logs (user_id, date, start_time, geofence_passed, start_lat, start_lng,
                              scheduled_start, scheduled_end, is_late, late_reason)
       VALUES ($1, CURRENT_DATE, NOW(), $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, date, start_time, status, geofence_passed, scheduled_start, scheduled_end, is_late, late_reason`,
      [userId, geofencePassed, startLat, startLng,
       scheduledStart, scheduledEnd, isLate, isLate ? late_reason.trim() : null]
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
    const { description, end_latitude, end_longitude, early_leave_reason } = req.body;

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

    if (log.geofence_passed === true) {
      if (end_latitude === undefined || end_longitude === undefined) {
        return res.status(400).json({
          error: { message: "Latitude dan longitude wajib karena geofence aktif saat shift dimulai", status: 400 },
        });
      }
    }

    // Check for early leave
    let isEarlyLeave = false;
    if (log.scheduled_end) {
      const schedEndDate = timeToTodayDate(log.scheduled_end);
      const now = new Date();
      if (now < schedEndDate) {
        isEarlyLeave = true;
        if (!early_leave_reason || !early_leave_reason.trim()) {
          return res.status(400).json({
            error: { message: "Alasan pulang cepat wajib diisi", status: 400 },
          });
        }
      }
    }

    // Calculate total work minutes
    const endTime = new Date();
    let totalMinutes;

    if (log.scheduled_start && !log.is_late) {
      // On time: count from scheduled start
      const schedStartDate = timeToTodayDate(log.scheduled_start);
      totalMinutes = calculateMinutes(schedStartDate, endTime);
    } else {
      // Late or No schedule: count from actual start
      const startTime = new Date(log.start_time);
      totalMinutes = calculateMinutes(startTime, endTime);
    }

    const updated = await pool.query(
      `UPDATE work_logs
       SET end_time = NOW(), description = $1, status = 'completed', total_work_minutes = $2,
           end_lat = $3, end_lng = $4, is_early_leave = $5, early_leave_reason = $6, updated_at = NOW()
       WHERE id = $7
       RETURNING id, date, start_time, end_time, total_work_minutes, status, description, geofence_passed,
                 scheduled_start, scheduled_end, is_late, late_reason, is_early_leave, early_leave_reason`,
      [description || log.description, totalMinutes, end_latitude, end_longitude,
       isEarlyLeave, isEarlyLeave ? early_leave_reason.trim() : null, id]
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
      `SELECT id, date, start_time, end_time, total_work_minutes, status, geofence_passed,
              scheduled_start, scheduled_end, is_late, late_reason, is_early_leave, early_leave_reason
       FROM work_logs
       WHERE user_id = $1 AND (status = 'active' OR date = CURRENT_DATE)
       ORDER BY status ASC, created_at DESC
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
      `SELECT id, date, start_time, end_time, total_work_minutes, description, status, geofence_passed,
              scheduled_start, scheduled_end, is_late, late_reason, is_early_leave, early_leave_reason
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
      `SELECT id, date, start_time, end_time, total_work_minutes, description, status, geofence_passed,
              scheduled_start, scheduled_end, is_late, late_reason, is_early_leave, early_leave_reason
       FROM work_logs
       WHERE user_id = $1 AND EXTRACT(MONTH FROM date) = $2 AND EXTRACT(YEAR FROM date) = $3
       ORDER BY date DESC`,
      [userId, Number(month), Number(year)]
    );

    const summaryResult = await pool.query(
      `SELECT COUNT(*) AS total_days, COALESCE(SUM(total_work_minutes), 0) AS total_work_minutes,
              COUNT(*) FILTER (WHERE is_late = true) AS total_late,
              COUNT(*) FILTER (WHERE is_early_leave = true) AS total_early_leave
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
        total_late: Number(summaryResult.rows[0].total_late),
        total_early_leave: Number(summaryResult.rows[0].total_early_leave),
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
      `SELECT wl.id, wl.date, wl.start_time, wl.end_time, wl.total_work_minutes,
              wl.description, wl.status, wl.geofence_passed,
              wl.scheduled_start, wl.scheduled_end, wl.is_late, wl.late_reason,
              wl.is_early_leave, wl.early_leave_reason,
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

    const query = `SELECT id, user_id, date, start_time, end_time, total_work_minutes, description, status, geofence_passed,
                          scheduled_start, scheduled_end, is_late, late_reason, is_early_leave, early_leave_reason
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
    const mergedEnd = end_time !== undefined ? (end_time ? new Date(end_time) : null) : (log.end_time ? new Date(log.end_time) : null);

    if (end_time === null) {
      fields.push(`status = 'active'`);
      fields.push(`total_work_minutes = NULL`);
      fields.push(`is_early_leave = NULL`);
      fields.push(`early_leave_reason = NULL`);
    } else if (mergedEnd) {
      let totalWorkMinutes = log.total_work_minutes;
      // Recalculate: if scheduled_start exists, use it
      if (log.scheduled_start && !log.is_late) {
        const schedStart = timeToTodayDate(log.scheduled_start);
        // Adjust schedStart to the log's date
        schedStart.setFullYear(mergedEnd.getFullYear(), mergedEnd.getMonth(), mergedEnd.getDate());
        totalWorkMinutes = calculateMinutes(schedStart, mergedEnd);
      } else {
        totalWorkMinutes = calculateMinutes(mergedStart, mergedEnd);
      }
      values.push(totalWorkMinutes);
      fields.push(`total_work_minutes = $${values.length}`);
      fields.push(`status = 'completed'`);
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

const deleteLogEntry = async (req, res, next) => {
  try {
    const { entryId } = req.params;

    const { rows: entries } = await pool.query(
      `SELECT e.id, l.user_id 
       FROM work_log_entries e
       JOIN work_logs l ON e.work_log_id = l.id
       WHERE e.id = $1`,
      [entryId]
    );

    if (entries.length === 0) {
      return res.status(404).json({ error: { message: "Catatan tidak ditemukan", status: 404 } });
    }

    const logOwnerId = entries[0].user_id;
    if (req.user.role !== "admin" && req.user.id !== logOwnerId) {
      return res.status(403).json({ error: { message: "Akses ditolak", status: 403 } });
    }

    await pool.query(`DELETE FROM work_log_entries WHERE id = $1`, [entryId]);

    res.json({ success: true, message: "Catatan berhasil dihapus" });
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
  deleteLog,
  addLogEntry,
  getLogEntries,
  deleteLogEntry,
};
