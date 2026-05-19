-- Migration V2: Weekly Schedules & Attendance Overhaul
-- Run with: node migrate.js

-- 1. New table: user_schedules (weekly schedule per user)
CREATE TABLE IF NOT EXISTS user_schedules (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day_of_week   INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  -- 0=Sunday, 1=Monday, 2=Tuesday, 3=Wednesday, 4=Thursday, 5=Friday, 6=Saturday
  start_time    TIME NOT NULL,
  end_time      TIME NOT NULL,
  created_at    TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, day_of_week)
);

ALTER TABLE user_schedules ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT NOW();

-- 2. Add schedule-related columns to work_logs
ALTER TABLE work_logs ADD COLUMN IF NOT EXISTS scheduled_start TIME;
ALTER TABLE work_logs ADD COLUMN IF NOT EXISTS scheduled_end TIME;
ALTER TABLE work_logs ADD COLUMN IF NOT EXISTS is_late BOOLEAN DEFAULT false;
ALTER TABLE work_logs ADD COLUMN IF NOT EXISTS late_reason TEXT;
ALTER TABLE work_logs ADD COLUMN IF NOT EXISTS is_early_leave BOOLEAN DEFAULT false;
ALTER TABLE work_logs ADD COLUMN IF NOT EXISTS early_leave_reason TEXT;

-- 3. Remove break system
ALTER TABLE work_logs DROP COLUMN IF EXISTS break_minutes;
DELETE FROM system_config WHERE key = 'break_minutes_default';
