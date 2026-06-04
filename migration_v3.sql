-- Migration V3: Leave Requests & Holidays
-- Run with: PGPASSWORD=00000 psql -U postgres -h localhost -d absensi_magang -f migration_v3.sql

-- 1. Leave types enum
DO $$ BEGIN
  CREATE TYPE leave_type AS ENUM ('izin', 'sakit', 'cuti');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2. Leave status enum
DO $$ BEGIN
  CREATE TYPE leave_status AS ENUM ('pending', 'approved', 'rejected');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 3. Leave requests table
CREATE TABLE IF NOT EXISTS leave_requests (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type          leave_type NOT NULL,
  start_date    DATE NOT NULL,
  end_date      DATE NOT NULL,
  reason        TEXT NOT NULL,
  status        leave_status NOT NULL DEFAULT 'pending',
  reviewed_by   UUID REFERENCES users(id),
  reviewed_at   TIMESTAMP,
  reviewer_notes TEXT,
  created_at    TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMP NOT NULL DEFAULT NOW()
);

-- 4. Holidays table
CREATE TABLE IF NOT EXISTS holidays (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  date          DATE NOT NULL UNIQUE,
  name          VARCHAR(100) NOT NULL,
  type          VARCHAR(20) NOT NULL DEFAULT 'national',
  created_at    TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_leave_requests_user_id ON leave_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_leave_requests_status ON leave_requests(status);
CREATE INDEX IF NOT EXISTS idx_holidays_date ON holidays(date);
