-- seed.sql
-- Run this after migration.sql to seed an initial admin account

INSERT INTO users (
  username, 
  password_hash, 
  full_name, 
  role, 
  email, 
  is_active
) VALUES (
  'admin',
  '$2b$10$F.Q7tWHcjlzFsSchCDox1.bV5SWmH4bHjJXOUHqoWjfGrFT..nD8e', -- hashed version of 'admin123'
  'System Administrator',
  'admin',
  'admin@absensi.local',
  true
) ON CONFLICT (username) DO NOTHING;
