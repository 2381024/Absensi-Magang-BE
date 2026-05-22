-- Performance Optimization Migration
-- Adds indexes to prevent table scans on heavily queried tables

-- =========================================
-- work_logs indexes (most frequently queried table)
-- =========================================

-- Core lookup: user_id + date (used by startShift, getTodayLog, getLogs)
CREATE INDEX IF NOT EXISTS idx_work_logs_user_date ON work_logs(user_id, date);

-- Status filtering for active shifts
CREATE INDEX IF NOT EXISTS idx_work_logs_user_status ON work_logs(user_id, status);

-- Daily dashboard aggregations (status + date)
CREATE INDEX IF NOT EXISTS idx_work_logs_date_status ON work_logs(date, status);

-- Late / early leave counts per day
CREATE INDEX IF NOT EXISTS idx_work_logs_date_late ON work_logs(date, is_late) WHERE is_late = true;
CREATE INDEX IF NOT EXISTS idx_work_logs_date_early_leave ON work_logs(date, is_early_leave) WHERE is_early_leave = true;

-- Month/year extraction queries (used by getLogs, getLogSummary, getAllLogs)
CREATE INDEX IF NOT EXISTS idx_work_logs_year_month ON work_logs(
    EXTRACT(YEAR FROM date),
    EXTRACT(MONTH FROM date)
);

-- Combined index for admin filtering
CREATE INDEX IF NOT EXISTS idx_work_logs_date_status_user ON work_logs(date DESC, status, user_id);

-- =========================================
-- users indexes
-- =========================================

-- Role filtering for admin/user queries
CREATE INDEX IF NOT EXISTS idx_users_role_active ON users(role, is_active) WHERE is_active = true;

-- Login lookup (case-sensitive by default; application ensures lowercase)
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);

-- =========================================
-- user_schedules indexes
-- =========================================

-- Schedule lookup by user + day (used by startShift, getMySchedule)
CREATE INDEX IF NOT EXISTS idx_user_schedules_user_day ON user_schedules(user_id, day_of_week);

-- =========================================
-- work_log_entries indexes
-- =========================================

-- Entries lookup by work_log_id (used by getLogById)
CREATE INDEX IF NOT EXISTS idx_work_log_entries_log_id ON work_log_entries(work_log_id);

-- =========================================
-- geofence_locations index
-- =========================================

-- Active geofence filtering (used by startShift)
CREATE INDEX IF NOT EXISTS idx_geofence_active ON geofence_locations(is_active) WHERE is_active = true;

-- =========================================
-- Analyze tables to update statistics after indexing
-- =========================================
ANALYZE work_logs;
ANALYZE users;
ANALYZE user_schedules;
ANALYZE work_log_entries;
ANALYZE geofence_locations;