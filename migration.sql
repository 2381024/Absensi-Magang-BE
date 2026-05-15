-- Migration: Absensi Magang — Full Schema
-- Run with: node migrate.js

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Enums
DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('admin', 'user');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE log_status AS ENUM ('active', 'completed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 1. users
CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  username      VARCHAR(50)  UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  email         VARCHAR(100) UNIQUE NOT NULL,
  full_name     VARCHAR(100) NOT NULL,
  role          user_role    NOT NULL DEFAULT 'user',
  position      VARCHAR(100),
  department    VARCHAR(100),
  phone_number  VARCHAR(20),
  avatar_url    VARCHAR(255),
  is_active     BOOLEAN      NOT NULL DEFAULT true,
  created_at    TIMESTAMP    NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMP    NOT NULL DEFAULT NOW()
);

-- 2. geofence_locations
CREATE TABLE IF NOT EXISTS geofence_locations (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name          VARCHAR(100) NOT NULL,
  latitude      DECIMAL(10,7) NOT NULL,
  longitude     DECIMAL(10,7) NOT NULL,
  radius_meters INTEGER NOT NULL,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_by    UUID REFERENCES users(id),
  created_at    TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMP NOT NULL DEFAULT NOW()
);

-- 3. work_logs
CREATE TABLE IF NOT EXISTS work_logs (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date              DATE NOT NULL,
  start_time        TIMESTAMP NOT NULL,
  end_time          TIMESTAMP,
  break_minutes     INTEGER NOT NULL DEFAULT 30,
  total_work_minutes INTEGER,
  description       TEXT,
  status            log_status NOT NULL DEFAULT 'active',
  start_lat         DECIMAL(10,7),
  start_lng         DECIMAL(10,7),
  end_lat           DECIMAL(10,7),
  end_lng           DECIMAL(10,7),
  geofence_passed   BOOLEAN,
  created_at        TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMP NOT NULL DEFAULT NOW(),

  UNIQUE(user_id, date)
);

-- 4. work_log_entries
CREATE TABLE IF NOT EXISTS work_log_entries (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  work_log_id UUID NOT NULL REFERENCES work_logs(id) ON DELETE CASCADE,
  content     TEXT NOT NULL,
  timestamp   TIMESTAMP NOT NULL DEFAULT NOW()
);

-- 5. system_config
CREATE TABLE IF NOT EXISTS system_config (
  key   VARCHAR(50) PRIMARY KEY,
  value TEXT NOT NULL
);

INSERT INTO system_config (key, value)
VALUES ('break_minutes_default', '30')
ON CONFLICT (key) DO NOTHING;