-- Migration V4: Bind interns to specific geofence locations
-- Run with: node migrate.js (now includes v4 automatically)
-- Or run manually with: psql -d absensi_magang -f migration_v4.sql

-- 1. Junction table: user <-> geofence (many-to-many)
--    Each user can be assigned to multiple geofences (e.g. HQ + branch).
--    CASCADE on both sides so deletes clean up automatically.
CREATE TABLE IF NOT EXISTS user_geofence_assignments (
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  geofence_id  UUID NOT NULL REFERENCES geofence_locations(id) ON DELETE CASCADE,
  assigned_at  TIMESTAMP NOT NULL DEFAULT NOW(),
  assigned_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  PRIMARY KEY (user_id, geofence_id)
);

CREATE INDEX IF NOT EXISTS idx_uga_user     ON user_geofence_assignments(user_id);
CREATE INDEX IF NOT EXISTS idx_uga_geofence ON user_geofence_assignments(geofence_id);

-- 2. Audit trail: which geofence did the intern actually check in against?
ALTER TABLE work_logs
  ADD COLUMN IF NOT EXISTS matched_geofence_id UUID REFERENCES geofence_locations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_work_logs_matched_geo ON work_logs(matched_geofence_id);