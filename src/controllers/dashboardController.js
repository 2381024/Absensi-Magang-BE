const pool = require("../config/db");

const getStats = async (req, res, next) => {
  try {
    const { rows } = await pool.query(`
      WITH
        today_logs AS (
          SELECT user_id, status, is_late, is_early_leave, total_work_minutes
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
        ),
        today_leaves AS (
          SELECT user_id, type FROM leave_requests
          WHERE status = 'approved'
            AND CURRENT_DATE BETWEEN start_date AND end_date
        )
      SELECT
        (SELECT COUNT(*) FROM users WHERE role = 'user') AS total_users,
        (SELECT COUNT(*) FROM active_users) AS active_users,
        (SELECT COUNT(*) FROM today_logs WHERE status = 'active') AS active_shifts_today,
        (SELECT COUNT(*) FROM today_logs WHERE status = 'completed') AS completed_shifts_today,
        (SELECT COUNT(*) FROM today_logs WHERE status = 'completed' AND is_late = false AND is_early_leave = false) AS completed_on_time,
        (SELECT COUNT(*) FROM today_logs WHERE status = 'completed' AND (is_late = true OR is_early_leave = true)) AS completed_with_issues,
        (SELECT COALESCE(SUM(total_work_minutes), 0) FROM today_logs WHERE status = 'completed') AS total_work_minutes_today,
        (SELECT COUNT(*) FROM active_users
         WHERE id IN (SELECT user_id FROM today_leaves WHERE type = 'izin')
        ) AS izin_today,
        (SELECT COUNT(*) FROM active_users
         WHERE id IN (SELECT user_id FROM today_leaves WHERE type = 'sakit')
        ) AS sakit_today,
        (SELECT COUNT(*) FROM active_users
         WHERE id IN (SELECT user_id FROM today_leaves WHERE type = 'cuti')
        ) AS cuti_today,
        (SELECT COUNT(*) FROM active_users
         WHERE id NOT IN (SELECT user_id FROM today_logs)
           AND id NOT IN (SELECT user_id FROM today_leaves)
           AND id IN (SELECT user_id FROM scheduled_users_today)
        ) AS absent_today,
        (SELECT COUNT(*) FROM today_logs WHERE is_late = true) AS late_today,
        (SELECT COUNT(*) FROM today_logs WHERE is_early_leave = true) AS early_leave_today,
        (SELECT COUNT(*) FROM leave_requests WHERE status = 'pending') AS pending_leaves
    `);

    const stats = rows[0];
    const totalWorkMinutesToday = Number(stats.total_work_minutes_today || 0);

    const izinToday = Number(stats.izin_today || 0);
    const sakitToday = Number(stats.sakit_today || 0);
    const cutiToday = Number(stats.cuti_today || 0);
    const totalOnLeave = izinToday + sakitToday + cutiToday;

    res.json({
      success: true,
      data: {
        total_users: Number(stats.total_users || 0),
        active_users: Number(stats.active_users || 0),
        active_shifts_today: Number(stats.active_shifts_today || 0),
        completed_shifts_today: Number(stats.completed_shifts_today || 0),
        completed_on_time: Number(stats.completed_on_time || 0),
        completed_with_issues: Number(stats.completed_with_issues || 0),
        total_work_hours_today: Number((totalWorkMinutesToday / 60).toFixed(2)),
        users_on_leave_today: totalOnLeave + Number(stats.absent_today || 0),
        izin_today: izinToday,
        sakit_today: sakitToday,
        cuti_today: cutiToday,
        on_leave_today: totalOnLeave,
        absent_today: Number(stats.absent_today || 0),
        late_today: Number(stats.late_today || 0),
        early_leave_today: Number(stats.early_leave_today || 0),
        pending_leaves: Number(stats.pending_leaves || 0),
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

const getWeeklyStats = async (req, res, next) => {
  try {
    const { rows } = await pool.query(`
      WITH dates AS (
        SELECT generate_series(
          (date_trunc('week', CURRENT_DATE))::date,
          (date_trunc('week', CURRENT_DATE) + interval '6 days')::date,
          '1 day'
        )::date AS date
      ),
      daily_logs AS (
        SELECT
          wl.date,
          COUNT(*) FILTER (WHERE wl.status = 'completed' AND wl.is_late = false) AS hadir,
          COUNT(*) FILTER (WHERE wl.is_late = true) AS terlambat
        FROM work_logs wl
        WHERE wl.date >= (date_trunc('week', CURRENT_DATE))::date
          AND wl.date <= (date_trunc('week', CURRENT_DATE) + interval '6 days')::date
        GROUP BY wl.date
      ),
      daily_leaves AS (
        SELECT
          d.date,
          COUNT(DISTINCT lr.user_id) FILTER (WHERE lr.type = 'izin') AS izin,
          COUNT(DISTINCT lr.user_id) FILTER (WHERE lr.type = 'sakit') AS sakit,
          COUNT(DISTINCT lr.user_id) FILTER (WHERE lr.type = 'cuti') AS cuti
        FROM dates d
        JOIN leave_requests lr ON lr.status = 'approved'
          AND d.date BETWEEN lr.start_date AND lr.end_date
        GROUP BY d.date
      )
      SELECT
        EXTRACT(DOW FROM d.date)::integer AS day_of_week,
        COALESCE(dl.hadir, 0) AS hadir,
        COALESCE(dl.terlambat, 0) AS terlambat,
        COALESCE(dlv.izin, 0) AS izin,
        COALESCE(dlv.sakit, 0) AS sakit,
        COALESCE(dlv.cuti, 0) AS cuti
      FROM dates d
      LEFT JOIN daily_logs dl ON d.date = dl.date
      LEFT JOIN daily_leaves dlv ON d.date = dlv.date
      ORDER BY d.date
    `);

    const dayNames = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
    const chartData = rows.map(row => ({
      name: dayNames[row.day_of_week],
      hadir: Number(row.hadir),
      terlambat: Number(row.terlambat),
      izin: Number(row.izin),
      sakit: Number(row.sakit),
      cuti: Number(row.cuti),
    }));

    res.json({ success: true, data: chartData });
  } catch (err) {
    next(err);
  }
};

module.exports = { getStats, getRecentLogs, getWeeklyStats };
