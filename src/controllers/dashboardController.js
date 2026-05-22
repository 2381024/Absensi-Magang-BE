const pool = require("../config/db");

const getStats = async (req, res, next) => {
  try {
    // Single optimized query replacing 8 separate round-trips
    const { rows } = await pool.query(`
      WITH
        today_logs AS (
          SELECT status, is_late, is_early_leave, total_work_minutes
          FROM work_logs
          WHERE date = CURRENT_DATE
        ),
        active_users AS (
          SELECT id FROM users
          WHERE is_active = true AND role = 'user'
        ),
        scheduled_users_today AS (
          SELECT user_id
          FROM user_schedules
          WHERE day_of_week = EXTRACT(DOW FROM CURRENT_DATE)::integer
        )
      SELECT
        (SELECT COUNT(*) FROM users WHERE role = 'user') AS total_users,
        (SELECT COUNT(*) FROM active_users) AS active_users,
        (SELECT COUNT(*) FROM today_logs WHERE status = 'active') AS active_shifts_today,
        (SELECT COUNT(*) FROM today_logs WHERE status = 'completed') AS completed_shifts_today,
        (SELECT COALESCE(SUM(total_work_minutes), 0) FROM today_logs WHERE status = 'completed') AS total_work_minutes_today,
        (SELECT COUNT(*) FROM active_users
         WHERE id NOT IN (SELECT user_id FROM today_logs)
           AND id IN (SELECT user_id FROM scheduled_users_today)
        ) AS users_on_leave_today,
        (SELECT COUNT(*) FROM today_logs WHERE is_late = true) AS late_today,
        (SELECT COUNT(*) FROM today_logs WHERE is_early_leave = true) AS early_leave_today
    `);

    const stats = rows[0];
    const totalWorkMinutesToday = Number(stats.total_work_minutes_today || 0);

    res.json({
      success: true,
      data: {
        total_users: Number(stats.total_users || 0),
        active_users: Number(stats.active_users || 0),
        active_shifts_today: Number(stats.active_shifts_today || 0),
        completed_shifts_today: Number(stats.completed_shifts_today || 0),
        total_work_hours_today: Number((totalWorkMinutesToday / 60).toFixed(2)),
        users_on_leave_today: Number(stats.users_on_leave_today || 0),
        late_today: Number(stats.late_today || 0),
        early_leave_today: Number(stats.early_leave_today || 0),
      },
    });
  } catch (err) {
    next(err);
  }
};

const getRecentLogs = async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT wl.id, wl.date, wl.start_time, wl.status, wl.is_late, wl.is_early_leave,
              json_build_object('id', u.id, 'full_name', u.full_name) AS user
       FROM work_logs wl
       JOIN users u ON u.id = wl.user_id
       WHERE wl.date = CURRENT_DATE
       ORDER BY wl.start_time DESC
       LIMIT 10`,
    );

    res.json({ success: true, data: rows });
  } catch (err) {
    next(err);
  }
};

module.exports = { getStats, getRecentLogs };