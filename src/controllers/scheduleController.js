const pool = require("../config/db");

// Admin: get all schedules grouped by user
const getAllSchedules = async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT us.id, us.user_id, us.day_of_week, us.start_time, us.end_time,
              u.full_name, u.email
       FROM user_schedules us
       JOIN users u ON u.id = us.user_id
       WHERE u.is_active = true
       ORDER BY u.full_name, us.day_of_week`
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    next(err);
  }
};

// Admin: get schedule for a specific user
const getScheduleByUserId = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const { rows } = await pool.query(
      `SELECT id, day_of_week, start_time, end_time
       FROM user_schedules
       WHERE user_id = $1
       ORDER BY day_of_week`,
      [userId]
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    next(err);
  }
};

// User: get own schedule
const getMySchedule = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { rows } = await pool.query(
      `SELECT id, day_of_week, start_time, end_time
       FROM user_schedules
       WHERE user_id = $1
       ORDER BY day_of_week`,
      [userId]
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    next(err);
  }
};

// Admin: bulk import schedules from Excel JSON
const importSchedules = async (req, res, next) => {
  try {
    const { schedules } = req.body;
    // schedules = [{ identifier, days: [{ day_of_week, start_time, end_time }, ...] }, ...]
    if (!Array.isArray(schedules) || schedules.length === 0) {
      return res.status(400).json({
        error: { message: "Data jadwal kosong atau format tidak valid", status: 400 },
      });
    }

    const client = await pool.connect();
    const results = { success: 0, failed: 0, errors: [] };

    try {
      await client.query("BEGIN");

      for (const entry of schedules) {
        const { identifier, days } = entry;
        if (!identifier || !Array.isArray(days)) {
          results.failed++;
          results.errors.push(`Entry tidak valid: ${identifier || "tanpa nama"}`);
          continue;
        }

        // Find user by full_name or email (case-insensitive)
        const userResult = await client.query(
          `SELECT id FROM users
           WHERE (LOWER(full_name) = LOWER($1) OR LOWER(email) = LOWER($1))
             AND is_active = true
           LIMIT 1`,
          [identifier.trim()]
        );

        if (userResult.rows.length === 0) {
          results.failed++;
          results.errors.push(`User tidak ditemukan: "${identifier}"`);
          continue;
        }

        const userId = userResult.rows[0].id;

        // Delete existing schedules for this user
        await client.query("DELETE FROM user_schedules WHERE user_id = $1", [userId]);

        // Insert new schedules
        for (const day of days) {
          if (day.start_time && day.end_time) {
            await client.query(
              `INSERT INTO user_schedules (user_id, day_of_week, start_time, end_time)
               VALUES ($1, $2, $3, $4)
               ON CONFLICT (user_id, day_of_week) DO UPDATE SET
                 start_time = EXCLUDED.start_time,
                 end_time = EXCLUDED.end_time,
                 updated_at = NOW()`,
              [userId, day.day_of_week, day.start_time, day.end_time]
            );
          }
        }

        results.success++;
      }

      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }

    res.json({ success: true, data: results });
  } catch (err) {
    next(err);
  }
};

// Admin: update a single schedule entry
const updateSchedule = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const { day_of_week, start_time, end_time } = req.body;

    if (day_of_week === undefined || !start_time || !end_time) {
      return res.status(400).json({
        error: { message: "day_of_week, start_time, dan end_time wajib diisi", status: 400 },
      });
    }

    const { rows } = await pool.query(
      `INSERT INTO user_schedules (user_id, day_of_week, start_time, end_time)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, day_of_week) DO UPDATE SET
         start_time = EXCLUDED.start_time,
         end_time = EXCLUDED.end_time,
         updated_at = NOW()
       RETURNING id, user_id, day_of_week, start_time, end_time`,
      [userId, day_of_week, start_time, end_time]
    );

    res.json({ success: true, data: rows[0] });
  } catch (err) {
    next(err);
  }
};

// Admin: delete a schedule entry
const deleteSchedule = async (req, res, next) => {
  try {
    const { userId, dayOfWeek } = req.params;
    const { rowCount } = await pool.query(
      `DELETE FROM user_schedules WHERE user_id = $1 AND day_of_week = $2`,
      [userId, Number(dayOfWeek)]
    );
    if (rowCount === 0) {
      return res.status(404).json({
        error: { message: "Jadwal tidak ditemukan", status: 404 },
      });
    }
    res.json({ success: true, data: { userId, dayOfWeek } });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getAllSchedules,
  getScheduleByUserId,
  getMySchedule,
  importSchedules,
  updateSchedule,
  deleteSchedule,
};
