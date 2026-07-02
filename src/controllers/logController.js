const pool = require("../config/db");

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

// Helper: combine a DATE string (YYYY-MM-DD) with a TIME string (HH:MM:SS) into a Date
// Uses the server's local timezone (Asia/Jakarta via process.env.TZ)
const dateTimeFromDateAndTime = (dateStr, timeStr) => {
  if (!dateStr || !timeStr) return null;
  const [year, month, day] = dateStr.split("-").map(Number);
  const timeParts = String(timeStr).split(":");
  return new Date(year, month - 1, day, Number(timeParts[0]), Number(timeParts[1]), timeParts[2] ? Number(timeParts[2]) : 0, 0);
};

// Helper: determine if scheduled end crosses midnight (e.g., shift 22:00 — 06:00)
const isCrossMidnight = (scheduledStart, scheduledEnd) => {
  if (!scheduledStart || !scheduledEnd) return false;
  const startParts = String(scheduledStart).split(":");
  const endParts = String(scheduledEnd).split(":");
  const startMinutes = Number(startParts[0]) * 60 + Number(startParts[1]);
  const endMinutes = Number(endParts[0]) * 60 + Number(endParts[1]);
  return endMinutes <= startMinutes;
};

// Helper: get scheduled start/end as Date objects anchored to the log's date.
// Handles cross-midnight shifts where scheduled_end is the next day.
const getScheduledDateTimes = (logDate, scheduledStart, scheduledEnd) => {
  if (!logDate || !scheduledStart) return { schedStart: null, schedEnd: null };
  const schedStart = dateTimeFromDateAndTime(logDate, String(scheduledStart));
  let schedEnd = null;
  if (scheduledEnd) {
    if (isCrossMidnight(scheduledStart, scheduledEnd)) {
      // End time is on the next day
      const [year, month, day] = logDate.split("-").map(Number);
      const nextDay = new Date(year, month - 1, day + 1);
      const nextDayStr = `${nextDay.getFullYear()}-${String(nextDay.getMonth() + 1).padStart(2, "0")}-${String(nextDay.getDate()).padStart(2, "0")}`;
      schedEnd = dateTimeFromDateAndTime(nextDayStr, String(scheduledEnd));
    } else {
      schedEnd = dateTimeFromDateAndTime(logDate, String(scheduledEnd));
    }
  }
  return { schedStart, schedEnd };
};

const startShift = async (req, res, next) => {
  const dayOfWeek = getTodayDayOfWeek();

  try {
    const userId = req.user.id;
    const { latitude, longitude, late_reason } = req.body;

    // Run independent queries concurrently
    const [todayLog, scheduleResult, geofenceActiveResult] = await Promise.all([
      pool.query(
        `SELECT id, status, date FROM work_logs
         WHERE user_id = $1 AND (status = 'active' OR date = CURRENT_DATE)
         ORDER BY status ASC
         LIMIT 1`,
        [userId]
      ),
      pool.query(
        `SELECT start_time, end_time FROM user_schedules WHERE user_id = $1 AND day_of_week = $2`,
        [userId, dayOfWeek]
      ),
      pool.query(`SELECT 1 FROM geofence_locations WHERE is_active = true LIMIT 1`)
    ]);

    if (todayLog.rows.length > 0) {
      const existing = todayLog.rows[0];
      const message = existing.status === 'active'
        ? "Anda masih memiliki shift yang sedang aktif"
        : "Shift hari ini sudah selesai";
      return res.status(409).json({
        error: { message, status: 409 },
      });
    }

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
    let geofencePassed = null;
    let startLat = null;
    let startLng = null;

    if (geofenceActiveResult.rows.length > 0) {
      if (latitude === undefined || longitude === undefined) {
        return res.status(400).json({
          error: { message: "Latitude dan longitude wajib ketika geofence aktif", status: 400 },
        });
      }

      const { rows: insideRows } = await pool.query(
        `SELECT id FROM geofence_locations
         WHERE is_active = true AND (
           6371000 * acos(
             least(1.0, greatest(-1.0,
               cos(radians($1)) * cos(radians(latitude)) *
               cos(radians(longitude) - radians($2)) +
               sin(radians($1)) * sin(radians(latitude))
             ))
           )
         ) <= radius_meters
         LIMIT 1`,
        [Number(latitude), Number(longitude)]
      );

      if (insideRows.length === 0) {
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
    // Handle UNIQUE constraint violation from concurrent start requests
    if (err.code === "23505") {
      return res.status(409).json({
        error: { message: "Shift hari ini sudah ada", status: 409 },
      });
    }
    next(err);
  }
};

const finishShift = async (req, res, next) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const userId = req.user.id;
    const { id } = req.params;
    const { description, end_latitude, end_longitude, early_leave_reason } = req.body;

    const { rows } = await client.query(
      `SELECT * FROM work_logs WHERE id = $1 AND user_id = $2 FOR UPDATE`,
      [id, userId]
    );
    const log = rows[0];
    if (!log) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: { message: "Log tidak ditemukan", status: 404 } });
    }
    if (log.status !== "active") {
      await client.query("ROLLBACK");
      return res.status(409).json({ error: { message: "Shift sudah selesai atau tidak aktif", status: 409 } });
    }

    if (log.geofence_passed === true) {
      if (end_latitude === undefined || end_longitude === undefined) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          error: { message: "Latitude dan longitude wajib karena geofence aktif saat shift dimulai", status: 400 },
        });
      }
    }

    // Check for early leave (handles cross-midnight shifts)
    let isEarlyLeave = false;
    if (log.scheduled_end) {
      const { schedEnd } = getScheduledDateTimes(log.date, log.scheduled_start, log.scheduled_end);
      const now = new Date();
      if (schedEnd && now < schedEnd) {
        isEarlyLeave = true;
        if (!early_leave_reason || !early_leave_reason.trim()) {
          await client.query("ROLLBACK");
          return res.status(400).json({
            error: { message: "Alasan pulang cepat wajib diisi", status: 400 },
          });
        }
      }
    }

    // Calculate total work minutes
    const endTime = new Date();
    const startTime = new Date(log.start_time);
    const totalMinutes = calculateMinutes(startTime, endTime);

    const updated = await client.query(
      `UPDATE work_logs
       SET end_time = NOW(), description = $1, status = 'completed', total_work_minutes = $2,
           end_lat = $3, end_lng = $4, is_early_leave = $5, early_leave_reason = $6, updated_at = NOW()
       WHERE id = $7
       RETURNING id, date, start_time, end_time, total_work_minutes, status, description, geofence_passed,
                 scheduled_start, scheduled_end, is_late, late_reason, is_early_leave, early_leave_reason`,
      [description || log.description, totalMinutes, end_latitude, end_longitude,
       isEarlyLeave, isEarlyLeave ? early_leave_reason.trim() : null, id]
    );

    await client.query("COMMIT");
    res.json({ success: true, data: updated.rows[0] });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    next(err);
  } finally {
    client.release();
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

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 31)); // default ~1 month
    const offset = (page - 1) * limit;

    const [logsResult, countResult] = await Promise.all([
      pool.query(
        `SELECT id, date, start_time, end_time, total_work_minutes, description, status, geofence_passed,
                scheduled_start, scheduled_end, is_late, late_reason, is_early_leave, early_leave_reason
         FROM work_logs
         WHERE user_id = $1 AND EXTRACT(MONTH FROM date) = $2 AND EXTRACT(YEAR FROM date) = $3
         ORDER BY date DESC
         LIMIT $4 OFFSET $5`,
        [userId, Number(month), Number(year), limit, offset]
      ),
      pool.query(
        `SELECT COUNT(*) AS total FROM work_logs
         WHERE user_id = $1 AND EXTRACT(MONTH FROM date) = $2 AND EXTRACT(YEAR FROM date) = $3`,
        [userId, Number(month), Number(year)]
      ),
    ]);

    const total = Number(countResult.rows[0].total);

    res.json({
      success: true,
      data: logsResult.rows,
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

const getLogSummary = async (req, res, next) => {
  try {
    const userId = req.user.id;
    let { month, year } = req.query;
    if (!year) {
      return res.status(400).json({
        error: { message: "Query parameter year wajib", status: 400 },
      });
    }

    const isAllMonths = !month || Number(month) === 0;
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(366, Math.max(1, parseInt(req.query.limit, 10) || (isAllMonths ? 366 : 31)));
    const offset = (page - 1) * limit;

    let logsQuery, logsParams;
    if (isAllMonths) {
      logsQuery = `SELECT id, date, start_time, end_time, total_work_minutes, description, status, geofence_passed,
                          scheduled_start, scheduled_end, is_late, late_reason, is_early_leave, early_leave_reason
                   FROM work_logs
                   WHERE user_id = $1 AND EXTRACT(YEAR FROM date) = $2
                   ORDER BY date DESC
                   LIMIT $3 OFFSET $4`;
      logsParams = [userId, Number(year), limit, offset];
    } else {
      logsQuery = `SELECT id, date, start_time, end_time, total_work_minutes, description, status, geofence_passed,
                          scheduled_start, scheduled_end, is_late, late_reason, is_early_leave, early_leave_reason
                   FROM work_logs
                   WHERE user_id = $1 AND EXTRACT(MONTH FROM date) = $2 AND EXTRACT(YEAR FROM date) = $3
                   ORDER BY date DESC
                   LIMIT $4 OFFSET $5`;
      logsParams = [userId, Number(month), Number(year), limit, offset];
    }
    const logsResult = await pool.query(logsQuery, logsParams);

    let summaryQuery, summaryParams;
    if (isAllMonths) {
      summaryQuery = `SELECT COUNT(*) AS total_days, COALESCE(SUM(total_work_minutes), 0) AS total_work_minutes,
                             COUNT(*) FILTER (WHERE is_late = true) AS total_late,
                             COUNT(*) FILTER (WHERE is_early_leave = true) AS total_early_leave
                      FROM work_logs
                      WHERE user_id = $1 AND EXTRACT(YEAR FROM date) = $2`;
      summaryParams = [userId, Number(year)];
    } else {
      summaryQuery = `SELECT COUNT(*) AS total_days, COALESCE(SUM(total_work_minutes), 0) AS total_work_minutes,
                             COUNT(*) FILTER (WHERE is_late = true) AS total_late,
                             COUNT(*) FILTER (WHERE is_early_leave = true) AS total_early_leave
                      FROM work_logs
                      WHERE user_id = $1 AND EXTRACT(MONTH FROM date) = $2 AND EXTRACT(YEAR FROM date) = $3`;
      summaryParams = [userId, Number(month), Number(year)];
    }
    const summaryResult = await pool.query(summaryQuery, summaryParams);

    const totalDays = Number(summaryResult.rows[0].total_days);
    const totalWorkMinutes = Number(summaryResult.rows[0].total_work_minutes);
    const averageHoursPerDay = totalDays > 0 ? Number((totalWorkMinutes / 60 / totalDays).toFixed(2)) : 0;

    let countQuery, countParams;
    if (isAllMonths) {
      countQuery = `SELECT COUNT(*) AS total FROM work_logs
                    WHERE user_id = $1 AND EXTRACT(YEAR FROM date) = $2`;
      countParams = [userId, Number(year)];
    } else {
      countQuery = `SELECT COUNT(*) AS total FROM work_logs
                    WHERE user_id = $1 AND EXTRACT(MONTH FROM date) = $2 AND EXTRACT(YEAR FROM date) = $3`;
      countParams = [userId, Number(month), Number(year)];
    }
    const countResult = await pool.query(countQuery, countParams);

    const total = Number(countResult.rows[0].total);

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
        pagination: {
          page,
          limit,
          total,
          total_pages: Math.ceil(total / limit),
        },
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
    if (!year) {
      return res.status(400).json({
        error: { message: "Query parameter year wajib", status: 400 },
      });
    }

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 50));
    const offset = (page - 1) * limit;

    const isAllMonths = !month || Number(month) === 0;
    let conditions, values;
    if (isAllMonths) {
      conditions = ["EXTRACT(YEAR FROM date) = $1"];
      values = [Number(year)];
    } else {
      conditions = ["EXTRACT(MONTH FROM date) = $1", "EXTRACT(YEAR FROM date) = $2"];
      values = [Number(month), Number(year)];
    }

    if (user_id) {
      values.push(user_id);
      conditions.push(`user_id = $${values.length}`);
    }
    if (status) {
      values.push(status);
      conditions.push(`status = $${values.length}`);
    }

    const whereClause = conditions.join(" AND ");

    const [logsResult, countResult] = await Promise.all([
      pool.query(
        `SELECT wl.id, wl.user_id, wl.date, wl.start_time, wl.end_time, wl.total_work_minutes, wl.description, wl.status, wl.geofence_passed,
                wl.scheduled_start, wl.scheduled_end, wl.is_late, wl.late_reason, wl.is_early_leave, wl.early_leave_reason,
                json_build_object('id', u.id, 'full_name', u.full_name) AS user,
                (SELECT string_agg(content, ' | ' ORDER BY timestamp) FROM work_log_entries WHERE work_log_id = wl.id) AS entries
         FROM work_logs wl
         JOIN users u ON u.id = wl.user_id
         WHERE ${whereClause}
         ORDER BY wl.date DESC, wl.start_time DESC
         LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
        [...values, limit, offset]
      ),
      pool.query(
        `SELECT COUNT(*) AS total FROM work_logs WHERE ${whereClause}`,
        values
      ),
    ]);

    const total = Number(countResult.rows[0].total);

    res.json({
      success: true,
      data: logsResult.rows,
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

    // Re-evaluate is_late when start_time changes
    let effectiveIsLate = log.is_late;
    let effectiveLateReason = log.late_reason;
    if (start_time !== undefined && log.scheduled_start) {
      const { schedStart } = getScheduledDateTimes(log.date, log.scheduled_start, log.scheduled_end);
      if (schedStart) {
        const newStart = new Date(start_time);
        if (newStart <= schedStart) {
          effectiveIsLate = false;
          effectiveLateReason = null;
        } else {
          effectiveIsLate = true;
        }
      }
    }

    if (effectiveIsLate !== log.is_late) {
      values.push(effectiveIsLate);
      fields.push(`is_late = $${values.length}`);
    }
    if (effectiveLateReason !== log.late_reason) {
      values.push(effectiveLateReason);
      fields.push(`late_reason = $${values.length}`);
    }

    if (end_time === null) {
      fields.push(`status = 'active'`);
      fields.push(`total_work_minutes = NULL`);
      fields.push(`is_early_leave = NULL`);
      fields.push(`early_leave_reason = NULL`);
    } else if (mergedEnd) {
      const totalWorkMinutes = calculateMinutes(mergedStart, mergedEnd);
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
      `SELECT e.id, l.user_id, l.status
       FROM work_log_entries e
       JOIN work_logs l ON e.work_log_id = l.id
       WHERE e.id = $1`,
      [entryId]
    );

    if (entries.length === 0) {
      return res.status(404).json({ error: { message: "Catatan tidak ditemukan", status: 404 } });
    }

    const entry = entries[0];
    if (req.user.role !== "admin" && req.user.id !== entry.user_id) {
      return res.status(403).json({ error: { message: "Akses ditolak", status: 403 } });
    }

    // Non-admin users can only delete entries from active (in-progress) logs
    if (req.user.role !== "admin" && entry.status !== "active") {
      return res.status(403).json({ error: { message: "Tidak dapat menghapus catatan dari shift yang sudah selesai", status: 403 } });
    }

    await pool.query(`DELETE FROM work_log_entries WHERE id = $1`, [entryId]);

    res.json({ success: true, message: "Catatan berhasil dihapus" });
  } catch (err) {
    next(err);
  }
};

const bulkRecalculateLogs = async (req, res, next) => {
  try {
    const { user_id, date_from, date_to } = req.body;

    const conditions = ["status = 'completed'", "end_time IS NOT NULL"];
    const values = [];

    if (user_id) {
      values.push(user_id);
      conditions.push(`user_id = $${values.length}`);
    }
    if (date_from) {
      values.push(date_from);
      conditions.push(`date >= $${values.length}`);
    }
    if (date_to) {
      values.push(date_to);
      conditions.push(`date <= $${values.length}`);
    }

    const whereClause = conditions.join(" AND ");

    const result = await pool.query(
      `UPDATE work_logs
       SET total_work_minutes = ROUND(EXTRACT(EPOCH FROM (end_time - start_time)) / 60),
           updated_at = NOW()
       WHERE ${whereClause}
       RETURNING id`,
      values
    );

    res.json({ success: true, data: { updated_count: result.rowCount } });
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
  bulkRecalculateLogs,
};