# Backend Specification — Absensi Magang (Logwork System)

Dokumen ini adalah panduan lengkap untuk pengembangan backend sistem Absensi Magang. Semua endpoint, struktur database, alur bisnis, dan middleware dijabarkan di sini.

---

## 📁 Struktur Proyek Backend

```
Absensi-Magang-BE/
├── src/
│   ├── config/
│   │   └── db.js              # Konfigurasi koneksi PostgreSQL (Pool)
│   ├── controllers/
│   │   ├── authController.js
│   │   ├── userController.js
│   │   ├── profileController.js
│   │   ├── geofenceController.js
│   │   ├── logController.js
│   │   ├── dashboardController.js
│   │   └── configController.js
│   ├── middleware/
│   │   ├── authMiddleware.js   # Verifikasi JWT
│   │   ├── adminMiddleware.js  # Role check admin
│   │   └── errorHandler.js     # Global error handler
│   ├── routes/
│   │   ├── authRoutes.js
│   │   ├── userRoutes.js
│   │   ├── profileRoutes.js
│   │   ├── geofenceRoutes.js
│   │   ├── logRoutes.js
│   │   ├── dashboardRoutes.js
│   │   └── configRoutes.js
│   └── utils/
│       └── haversine.js       # Kalkulasi jarak koordinat
├── docs/
│   └── backend-spec.md        # Dokumen ini
├── .env
├── .gitignore
├── index.js
├── package.json
└── README.md
```

---

## 🗄️ Database Schema

### 1. `users` — Data pengguna

```sql
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TYPE user_role AS ENUM ('admin', 'user');

CREATE TABLE users (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  username    VARCHAR(50)  UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  email       VARCHAR(100) UNIQUE NOT NULL,
  full_name   VARCHAR(100) NOT NULL,
  role        user_role    NOT NULL DEFAULT 'user',
  position    VARCHAR(100),
  department  VARCHAR(100),
  phone_number VARCHAR(20),
  avatar_url  VARCHAR(255),
  is_active   BOOLEAN      NOT NULL DEFAULT true,
  created_at  TIMESTAMP    NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMP    NOT NULL DEFAULT NOW()
);
```

### 2. `geofence_locations` — Koordinat & radius area kerja

```sql
CREATE TABLE geofence_locations (
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
```

### 3. `work_logs` — Log shift harian

```sql
CREATE TYPE log_status AS ENUM ('active', 'completed');

CREATE TABLE work_logs (
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
```

### 4. `work_log_entries` — Catatan progres pekerjaan selama shift

```sql
CREATE TABLE work_log_entries (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  work_log_id UUID NOT NULL REFERENCES work_logs(id) ON DELETE CASCADE,
  content     TEXT NOT NULL,
  timestamp   TIMESTAMP NOT NULL DEFAULT NOW()
);
```

### 5. `system_config` — Konfigurasi global

```sql
CREATE TABLE system_config (
  key   VARCHAR(50) PRIMARY KEY,
  value TEXT NOT NULL
);

-- Nilai awal
INSERT INTO system_config (key, value) VALUES ('break_minutes_default', '30');
```

### Relasi Antar Tabel

```
users 1───N work_logs
users 1───N geofence_locations (created_by)
work_logs 1───N work_log_entries
```

---

## 🔌 API Endpoints

Semua endpoint (kecuali Auth login) membutuhkan **header**:
```
Authorization: Bearer <JWT_TOKEN>
```

### Response Standar

**Sukses:**
```json
{
  "success": true,
  "data": { ... }
}
```

**Error:**
```json
{
  "error": {
    "message": "Deskripsi error",
    "status": 400
  }
}
```

---

### 1. Authentication — `/api/auth`

| Method | Endpoint | Role | Deskripsi |
|---|---|---|---|
| POST | `/api/auth/login` | Public | Login user |
| POST | `/api/auth/logout` | Auth | Logout |
| GET | `/api/auth/me` | Auth | Data user yang sedang login |

#### `POST /api/auth/login`
**Body:**
```json
{
  "username": "john_doe",
  "password": "secret123"
}
```
**Response (200):**
```json
{
  "success": true,
  "data": {
    "token": "eyJhbGciOi...",
    "user": {
      "id": "uuid",
      "username": "john_doe",
      "full_name": "John Doe",
      "role": "user",
      "position": "Developer",
      "department": "Engineering",
      "avatar_url": null
    }
  }
}
```

#### `POST /api/auth/logout`
(Invalidasi token — implementasi blacklist opsional; bisa juga client-side delete token)

#### `GET /api/auth/me`
**Response (200):**
```json
{
  "success": true,
  "data": {
    "user": { ... }
  }
}
```

---

### 2. Users (Admin Only) — `/api/users`

> ⚠️ Seluruh endpoint di grup ini hanya bisa diakses oleh **admin**.

| Method | Endpoint | Deskripsi |
|---|---|---|
| GET | `/api/users` | List semua user |
| GET | `/api/users/:id` | Detail satu user |
| POST | `/api/users` | Buat user baru |
| PUT | `/api/users/:id` | Edit user |
| DELETE | `/api/users/:id` | Hapus (soft delete → `is_active = false`) |

#### `POST /api/users`
**Body:**
```json
{
  "username": "jane_doe",
  "password": "secret456",
  "email": "jane@company.com",
  "full_name": "Jane Doe",
  "role": "user",
  "position": "Designer",
  "department": "Creative",
  "phone_number": "08123456789"
}
```

#### `PUT /api/users/:id`
**Body (field opsional):**
```json
{
  "full_name": "Jane Smith",
  "position": "Senior Designer",
  "department": "UI/UX",
  "is_active": true
}
```

#### `DELETE /api/users/:id`
Tidak benar-benar menghapus; set `is_active = false`.
User dengan `is_active = false` **tidak bisa login**.
Work logs lama user tetap tersimpan.

---

### 3. Profile (User & Admin) — `/api/profile`

| Method | Endpoint | Deskripsi |
|---|---|---|
| GET | `/api/profile` | Lihat profil sendiri |
| PUT | `/api/profile` | Edit profil sendiri |

#### `PUT /api/profile`
**Body (field opsional):**
```json
{
  "full_name": "John Updated",
  "email": "john_new@company.com",
  "phone_number": "08223334444",
  "current_password": "oldpassword",
  "new_password": "newpassword123"
}
```

---

### 4. Geofence (Admin Only) — `/api/geofence`

> ⚠️ Seluruh endpoint di grup ini hanya bisa diakses oleh **admin**.

| Method | Endpoint | Deskripsi |
|---|---|---|
| GET | `/api/geofence` | List semua lokasi geofence |
| POST | `/api/geofence` | Tambah lokasi baru |
| PUT | `/api/geofence/:id` | Edit lokasi |
| DELETE | `/api/geofence/:id` | Hapus lokasi |
| PATCH | `/api/geofence/:id/toggle` | Aktifkan / nonaktifkan |

#### `POST /api/geofence`
**Body:**
```json
{
  "name": "Kantor Pusat",
  "latitude": -6.2088,
  "longitude": 106.8456,
  "radius_meters": 100,
  "is_active": true
}
```

#### `PATCH /api/geofence/:id/toggle`
Mengganti nilai `is_active` menjadi kebalikannya (toggle).

---

### 5. Work Logs — `/api/logs`

| Method | Endpoint | Role | Deskripsi |
|---|---|---|---|
| POST | `/api/logs/start` | User | Mulai shift |
| PUT | `/api/logs/:id/finish` | User | Selesai shift |
| GET | `/api/logs/today` | User | Status shift hari ini |
| GET | `/api/logs` | User | Log milik sendiri (query param) |
| GET | `/api/logs/summary` | User | Total jam kerja per periode |
| GET | `/api/logs/:id` | Auth | Detail satu log |
| GET | `/api/logs/all` | Admin | Semua log (query param) |
| PUT | `/api/logs/:id` | Admin | Edit work log |
| PATCH | `/api/logs/:id/break` | Admin | Ubah durasi break |
| DELETE | `/api/logs/:id` | Admin | Hapus log |

#### `POST /api/logs/start` — Mulai Shift

**Body (jika tidak ada geofence aktif — kosong):**
```json
{}
```

**Body (jika ada geofence aktif — wajib):**
```json
{
  "latitude": -6.2088,
  "longitude": 106.8456
}
```

**Logic Backend:**
1. Cek `geofence_locations` yang `is_active = true`
2. **Tidak ada yg aktif** → langsung buat `work_logs` baru, `geofence_passed = null`
3. **Ada yg aktif** → Frontend **harus** kirim `latitude` & `longitude`
   - Hitung jarak (Haversine) ke **semua** lokasi geofence aktif
   - Jika user berada dalam radius **minimal satu** lokasi → `geofence_passed = true`, simpan `start_lat/start_lng`
   - Jika tidak ada lokasi yg cocok → **403 Forbidden** + pesan lokasi

**Aturan tambahan:**
- Tidak bisa mulai shift jika shift hari ini sudah `active`
- Tidak bisa mulai shift jika user `is_active = false`

**Response (201):**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "date": "2026-05-13",
    "start_time": "2026-05-13T08:00:00.000Z",
    "status": "active",
    "geofence_passed": true
  }
}
```

#### `PUT /api/logs/:id/finish` — Selesai Shift

**Body:**
```json
{
  "description": "Hari ini mengerjakan fitur login dan memperbaiki bug pada dashboard.",
  "end_latitude": -6.2088,
  "end_longitude": 106.8456
}
```
( `end_latitude` dan `end_longitude` hanya wajib jika geofence aktif saat shift dimulai )

**Logic Backend:**
1. Set `end_time = NOW()`
2. Hitung `total_work_minutes = ROUND((EXTRACT(EPOCH FROM end_time - start_time) / 60) - break_minutes)`
3. Set `status = 'completed'`
4. Jika ada `end_latitude/end_longitude` → simpan `end_lat/end_lng`
5. Simpan `description`

**Response (200):**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "start_time": "2026-05-13T08:00:00.000Z",
    "end_time": "2026-05-13T17:00:00.000Z",
    "break_minutes": 30,
    "total_work_minutes": 510,
    "status": "completed"
  }
}
```

#### `GET /api/logs/today` — Status Shift Hari Ini

**Response (200) — Belum mulai:**
```json
{
  "success": true,
  "data": null
}
```

**Response (200) — Sedang aktif:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "date": "2026-05-13",
    "start_time": "2026-05-13T08:00:00.000Z",
    "status": "active",
    "geofence_passed": true
  }
}
```

**Response (200) — Sudah selesai:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "date": "2026-05-13",
    "start_time": "2026-05-13T08:00:00.000Z",
    "end_time": "2026-05-13T17:00:00.000Z",
    "break_minutes": 30,
    "total_work_minutes": 510,
    "status": "completed"
  }
}
```

#### `GET /api/logs` — Log User Sendiri

**Query Params:**
| Param | Wajib | Deskripsi |
|---|---|---|
| `month` | Ya | Bulan (1-12) |
| `year` | Ya | Tahun (e.g. 2026) |

**Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "date": "2026-05-13",
      "start_time": "2026-05-13T08:00:00.000Z",
      "end_time": "2026-05-13T17:00:00.000Z",
      "break_minutes": 30,
      "total_work_minutes": 510,
      "description": "Mengerjakan fitur login...",
      "status": "completed"
    }
  ]
}
```

#### `GET /api/logs/summary` — Total Jam Kerja

**Query Params:**
| Param | Wajib | Deskripsi |
|---|---|---|
| `month` | Ya | Bulan (1-12) |
| `year` | Ya | Tahun (e.g. 2026) |

**Response (200):**
```json
{
  "success": true,
  "data": {
    "total_days": 22,
    "total_work_minutes": 11220,
    "total_work_hours": 187.0,
    "average_hours_per_day": 8.5,
    "logs": [ ... ]
  }
}
```
( `logs` berisi array work_log bulan tersebut, sama seperti `/api/logs` )

#### `GET /api/logs/:id` — Detail Satu Log
Mengembalikan work_log + work_log_entries:

```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "user": { "id": "uuid", "full_name": "John Doe" },
    "date": "2026-05-13",
    "start_time": "2026-05-13T08:00:00.000Z",
    "end_time": "2026-05-13T17:00:00.000Z",
    "break_minutes": 30,
    "total_work_minutes": 510,
    "description": "Hari ini mengerjakan fitur login...",
    "status": "completed",
    "geofence_passed": true,
    "entries": [
      { "id": "uuid", "content": "Setup project structure", "timestamp": "2026-05-13T08:15:00.000Z" },
      { "id": "uuid", "content": "Implement login API", "timestamp": "2026-05-13T10:30:00.000Z" }
    ]
  }
}
```

#### `GET /api/logs/all` — Semua Log (Admin)

**Query Params:**
| Param | Wajib | Deskripsi |
|---|---|---|
| `user_id` | Tidak | Filter per user |
| `month` | Ya | Bulan (1-12) |
| `year` | Ya | Tahun |
| `status` | Tidak | `active` / `completed` |

#### `PUT /api/logs/:id` — Admin Edit Log

**Body (field opsional):**
```json
{
  "start_time": "2026-05-13T08:30:00.000Z",
  "end_time": "2026-05-13T17:30:00.000Z",
  "description": "Deskripsi diperbarui oleh admin"
}
```
( Admin bisa mengubah `start_time`, `end_time`, `description`. Backend menghitung ulang `total_work_minutes` jika waktu berubah. )

#### `PATCH /api/logs/:id/break` — Admin Ubah Durasi Break

**Body:**
```json
{
  "break_minutes": 60
}
```

#### `DELETE /api/logs/:id` — Admin Hapus Log
Menghapus work_log beserta entries terkait ( `ON DELETE CASCADE` ).

---

### 6. Work Log Entries — `/api/logs/:id/entries`

| Method | Endpoint | Role | Deskripsi |
|---|---|---|---|
| POST | `/api/logs/:id/entries` | User | Tambah catatan pekerjaan |
| GET | `/api/logs/:id/entries` | Auth | Lihat semua catatan |

#### `POST /api/logs/:id/entries`
**Body:**
```json
{
  "content": "Menyelesaikan validasi form login"
}
```
**Aturan:**
- Log harus milik user sendiri
- Log harus berstatus `active`
- Tidak ada batasan jumlah entry

---

### 7. Dashboard (Admin Only) — `/api/dashboard`

| Method | Endpoint | Deskripsi |
|---|---|---|
| GET | `/api/dashboard/stats` | Statistik ringkasan |
| GET | `/api/dashboard/recent-logs` | Log terbaru hari ini |

#### `GET /api/dashboard/stats`
**Response (200):**
```json
{
  "success": true,
  "data": {
    "total_users": 25,
    "active_users": 20,
    "active_shifts_today": 8,
    "completed_shifts_today": 12,
    "total_work_hours_today": 96.5,
    "users_on_leave_today": 5
  }
}
```

#### `GET /api/dashboard/recent-logs`
**Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "user": { "id": "uuid", "full_name": "John Doe" },
      "date": "2026-05-13",
      "start_time": "2026-05-13T08:00:00.000Z",
      "status": "active"
    }
  ]
}
```

---

### 8. System Config (Admin Only) — `/api/config`

| Method | Endpoint | Deskripsi |
|---|---|---|
| GET | `/api/config` | Lihat semua config |
| PUT | `/api/config` | Update config |

#### `GET /api/config`
```json
{
  "success": true,
  "data": {
    "break_minutes_default": "30"
  }
}
```

#### `PUT /api/config`
**Body:**
```json
{
  "break_minutes_default": 45
}
```

---

### 9. Health Check — `/api/health`

| Method | Endpoint | Role | Deskripsi |
|---|---|---|---|
| GET | `/api/health` | Public | Cek server + database |

---

## 🏗️ Arsitektur & Middleware

### Middleware

#### `authMiddleware.js`
- Mengekstrak token dari header `Authorization: Bearer <token>`
- Verifikasi JWT dengan secret key
- Inject `req.user = { id, username, role }`
- Token expired/invalid → **401 Unauthorized**

#### `adminMiddleware.js`
- Cek `req.user.role === 'admin'`
- Bukan admin → **403 Forbidden**

### Alur General Request

```
Client → cors() → express.json() → authMiddleware → adminMiddleware? → Route → Controller → DB → Response
```

### Error Handler
Semua error dikembalikan format:
```json
{
  "error": {
    "message": "Deskripsi error",
    "status": 500
  }
}
```

---

## 📐 Aturan Bisnis Detail

### 1. Geofence Check (Haversine Formula)
Saat user memulai shift dan ada geofence aktif, backend menghitung jarak antara koordinat user dengan koordinat geofence:

```
a = sin²(Δlat/2) + cos(lat1) * cos(lat2) * sin²(Δlng/2)
c = 2 * atan2(√a, √(1−a))
distance = R * c

R = 6,371,000 meter (jari-jari bumi)
```

User lolos jika `distance <= radius_meters` untuk **minimal satu** geofence aktif.

### 2. Shift Constraints
- **Satu shift per hari**: Constraint `UNIQUE(user_id, date)` mencegah duplikasi
- **Tidak bisa mulai shift baru** jika masih `active`
- **Tidak bisa finish shift** jika sudah `completed`
- **Tidak bisa tambah entry** jika shift tidak `active`

### 3. Break Logic
- `break_minutes` default diambil dari `system_config.break_minutes_default`
- Dipotong otomatis dari durasi kerja: `total_work_minutes = (end - start) - break_minutes`
- Admin bisa override per work log via `PATCH /api/logs/:id/break`
- Jika `total_work_minutes` negatif → set ke 0

### 4. User Status
- `is_active = false` → user tidak bisa login
- Admin yang di-nonaktifkan tetap bisa dinonaktifkan → tidak bisa login
- Work log user nonaktif tetap tersimpan

### 5. Date vs Timezone
- `date` dan semua `TIMESTAMP` disimpan dalam **UTC**
- Konversi ke timezone lokal dilakukan di frontend
- `date` dihitung dari `start_time` (UTC), bukan dari input client

---

## 📦 Dependencies

| Package | Versi | Keterangan |
|---|---|---|
| express | ^5.2.1 | Framework HTTP |
| pg | ^8.20.0 | Driver PostgreSQL |
| cors | ^2.8.6 | Cross-Origin |
| dotenv | ^17.4.2 | Environment variables |
| bcrypt | ^5.x | Password hashing |
| jsonwebtoken | ^9.x | JWT authentication |
| nodemon | ^3.1.14 | Dev auto-reload |
| uuid-ossp | (PG extension) | UUID generation |

---

## 🚀 Implementasi Bertahap (Prioritas)

### Tahap 1 — Fondasi
- [ ] Setup database: semua tabel + extension `uuid-ossp`
- [ ] Middleware: `authMiddleware`, `adminMiddleware`
- [ ] Auth: `POST /auth/login`, `GET /auth/me`
- [ ] Health check: `GET /health`

### Tahap 2 — Admin
- [ ] Users CRUD: `GET/POST/PUT/DELETE /api/users`
- [ ] Geofence CRUD: `GET/POST/PUT/DELETE/PATCH /api/geofence`
- [ ] Config: `GET/PUT /api/config`

### Tahap 3 — User (Core)
- [ ] Profile: `GET/PUT /api/profile`
- [ ] Mulai shift: `POST /api/logs/start` (dengan geofence check)
- [ ] Selesai shift: `PUT /api/logs/:id/finish`
- [ ] Status hari ini: `GET /api/logs/today`
- [ ] Work log entries: `POST /api/logs/:id/entries`

### Tahap 4 — Riwayat & Admin Logs
- [ ] Log user: `GET /api/logs`, `GET /api/logs/summary`, `GET /api/logs/:id`
- [ ] Admin log management: `GET /api/logs/all`, `PUT /api/logs/:id`, `PATCH /api/logs/:id/break`, `DELETE /api/logs/:id`

### Tahap 5 — Dashboard
- [ ] Dasbor admin: `GET /api/dashboard/stats`, `GET /api/dashboard/recent-logs`

---

## 🧪 Testing Checklist

- [ ] Login dengan kredensial valid → dapat token
- [ ] Login dengan kredensial salah → 401
- [ ] Login dengan user nonaktif → 403
- [ ] Akses endpoint admin tanpa role admin → 403
- [ ] Akses endpoint tanpa token → 401
- [ ] Buat user (admin) → sukses
- [ ] Duplikat username/email → 409 Conflict
- [ ] Mulai shift tanpa geofence → sukses, `geofence_passed = null`
- [ ] Mulai shift di dalam geofence → sukses, `geofence_passed = true`
- [ ] Mulai shift di luar geofence → 403
- [ ] Mulai shift kedua kali di hari sama → 409
- [ ] Selesai shift → `total_work_minutes` dihitung benar
- [ ] Admin ubah `break_minutes` → `total_work_minutes` dihitung ulang
- [ ] User lihat log orang lain → 403 (hanya admin)
