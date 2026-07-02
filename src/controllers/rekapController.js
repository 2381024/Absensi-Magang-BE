const pool = require("../config/db");

function countWeekdays(month, year) {
  const daysInMonth = new Date(year, month, 0).getDate();
  let count = 0;
  for (let day = 1; day <= daysInMonth; day++) {
    const dow = new Date(year, month - 1, day).getDay();
    if (dow >= 1 && dow <= 5) count++;
  }
  return count;
}

function formatMinutes(minutes) {
  if (!minutes) return "0 jam";
  const hrs = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hrs === 0) return `${mins} menit`;
  if (mins === 0) return `${hrs} jam`;
  return `${hrs} jam ${mins} menit`;
}

const getRekapAll = async (req, res, next) => {
  try {
    const { month, year } = req.query;
    if (!year) {
      return res.status(400).json({
        error: { message: "Query parameter year wajib", status: 400 },
      });
    }

    const params = [Number(year)];
    let monthFilter = '';
    if (month) {
      monthFilter = 'AND EXTRACT(MONTH FROM wl.date) = $2';
      params.push(Number(month));
    }

    const { rows } = await pool.query(
      `SELECT
        u.id AS user_id,
        u.full_name,
        COUNT(wl.id) AS total_days,
        COALESCE(SUM(wl.total_work_minutes), 0) AS total_work_minutes,
        COUNT(*) FILTER (WHERE wl.is_late = true) AS total_late,
        COUNT(*) FILTER (WHERE wl.is_early_leave = true) AS total_early_leave,
        lv.total_izin,
        lv.total_sakit,
        lv.total_cuti
      FROM users u
      LEFT JOIN work_logs wl ON wl.user_id = u.id
        AND EXTRACT(YEAR FROM wl.date) = $1
        ${monthFilter}
        AND wl.status = 'completed'
      LEFT JOIN LATERAL (
        SELECT
          COUNT(*) FILTER (WHERE type = 'izin') AS total_izin,
          COUNT(*) FILTER (WHERE type = 'sakit') AS total_sakit,
          COUNT(*) FILTER (WHERE type = 'cuti') AS total_cuti
        FROM leave_requests lr
        WHERE lr.user_id = u.id AND lr.status = 'approved'
          AND EXTRACT(YEAR FROM lr.start_date) = $1
          ${month ? `AND EXTRACT(MONTH FROM lr.start_date) = $2` : ''}
      ) lv ON true
      WHERE u.role = 'user' AND u.is_active = true
      GROUP BY u.id, u.full_name, lv.total_izin, lv.total_sakit, lv.total_cuti
      ORDER BY u.full_name ASC`,
      params
    );

    const totalEmployees = rows.length;
    const totalWorkDays = rows.reduce((sum, r) => sum + Number(r.total_days), 0);
    const totalWorkMinutes = rows.reduce((sum, r) => sum + Number(r.total_work_minutes), 0);
    let weekdaysInMonth;
    if (month) {
      weekdaysInMonth = countWeekdays(Number(month), Number(year));
    } else {
      weekdaysInMonth = 0;
      for (let m = 1; m <= 12; m++) {
        weekdaysInMonth += countWeekdays(m, Number(year));
      }
    }

    // Subtract national holidays (NOT cuti_bersama) from working day count
    const holidayParams = month ? [Number(year), Number(month)] : [Number(year)];
    const holidayQuery = month
      ? `SELECT COUNT(*) AS cnt FROM holidays WHERE type = 'national' AND EXTRACT(YEAR FROM date) = $1 AND EXTRACT(MONTH FROM date) = $2`
      : `SELECT COUNT(*) AS cnt FROM holidays WHERE type = 'national' AND EXTRACT(YEAR FROM date) = $1`;
    const holidayRes = await pool.query(holidayQuery, holidayParams);
    const nationalHolidays = Number(holidayRes.rows[0].cnt);
    weekdaysInMonth = Math.max(0, weekdaysInMonth - nationalHolidays);

    let totalAttendancePct = 0;
    const items = rows.map((r) => {
      const days = Number(r.total_days);
      const minutes = Number(r.total_work_minutes);
      const avgPerDay = days > 0 ? minutes / 60 / days : 0;
      const attPct = weekdaysInMonth > 0 ? (days / weekdaysInMonth) * 100 : 0;
      totalAttendancePct += attPct;

      return {
        user_id: r.user_id,
        full_name: r.full_name,
        total_days: days,
        total_work_hours: formatMinutes(minutes),
        average_per_day: `${avgPerDay.toFixed(1)} jam`,
        total_late: Number(r.total_late),
        total_early_leave: Number(r.total_early_leave),
        total_izin: Number(r.total_izin || 0),
        total_sakit: Number(r.total_sakit || 0),
        total_cuti: Number(r.total_cuti || 0),
        attendance_percentage: `${attPct.toFixed(2)}%`,
      };
    });

    const avgAttendance = totalEmployees > 0 ? totalAttendancePct / totalEmployees : 0;

    res.json({
      success: true,
      data: {
        summary: {
          total_employees: totalEmployees,
          total_work_days: totalWorkDays,
          total_work_hours: formatMinutes(totalWorkMinutes),
          average_attendance: `${avgAttendance.toFixed(1)}%`,
        },
        items,
      },
    });
  } catch (err) {
    next(err);
  }
};

module.exports = { getRekapAll };
