const pool = require("../config/db");

const getStats = async (req, res, next) => {
  try {
    const [
      totalUsersResult,
      activeUsersResult,
      activeShiftsResult,
      completedShiftsResult,
      totalWorkMinutesResult,
      usersOnLeaveResult,
    ] = await Promise.all([
      pool.query("SELECT COUNT(*) AS total_users FROM users"),
      pool.query(
        "SELECT COUNT(*) AS active_users FROM users WHERE is_active = true",
      ),
      pool.query(
        "SELECT COUNT(*) AS active_shifts_today FROM work_logs WHERE date = CURRENT_DATE AND status = 'active'",
      ),
      pool.query(
        "SELECT COUNT(*) AS completed_shifts_today FROM work_logs WHERE date = CURRENT_DATE AND status = 'completed'",
      ),
      pool.query(
        "SELECT COALESCE(SUM(total_work_minutes), 0) AS total_work_minutes_today FROM work_logs WHERE date = CURRENT_DATE AND status = 'completed'",
      ),
      pool.query(
        "SELECT COUNT(*) AS users_on_leave_today FROM users WHERE is_active = true AND id NOT IN (SELECT user_id FROM work_logs WHERE date = CURRENT_DATE)",
      ),
    ]);

    const totalUsers = Number(totalUsersResult.rows[0].total_users || 0);
    const activeUsers = Number(activeUsersResult.rows[0].active_users || 0);
    const activeShiftsToday = Number(
      activeShiftsResult.rows[0].active_shifts_today || 0,
    );
    const completedShiftsToday = Number(
      completedShiftsResult.rows[0].completed_shifts_today || 0,
    );
    const totalWorkMinutesToday = Number(
      totalWorkMinutesResult.rows[0].total_work_minutes_today || 0,
    );
    const usersOnLeaveToday = Number(
      usersOnLeaveResult.rows[0].users_on_leave_today || 0,
    );

    res.json({
      success: true,
      data: {
        total_users: totalUsers,
        active_users: activeUsers,
        active_shifts_today: activeShiftsToday,
        completed_shifts_today: completedShiftsToday,
        total_work_hours_today: Number((totalWorkMinutesToday / 60).toFixed(2)),
        users_on_leave_today: usersOnLeaveToday,
      },
    });
  } catch (err) {
    next(err);
  }
};

const getRecentLogs = async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT wl.id, wl.date, wl.start_time, wl.status,
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
