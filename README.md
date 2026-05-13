# Absensi Magang - Backend

REST API untuk sistem pencatatan kehadiran (absensi) magang, dibangun dengan stack PERN (PostgreSQL, Express, React, Node.js).

## 🛠️ Tech Stack

| Teknologi   | Versi    | Keterangan                          |
|-------------|----------|-------------------------------------|
| Node.js     | 18+      | Runtime JavaScript                  |
| Express     | 5.x      | Framework HTTP server               |
| PostgreSQL  | 15+      | Database relasional                 |
| pg          | 8.x      | Driver PostgreSQL untuk Node.js     |
| cors        | 2.x      | Middleware Cross-Origin Resource    |
| dotenv      | 17.x     | Load environment variables dari file |
| nodemon     | 3.x      | Auto-reload saat development        |

## 📁 Struktur Proyek

```
Absensi-Magang-BE/
├── src/
│   ├── config/
│   │   └── db.js              # Konfigurasi koneksi PostgreSQL (Pool)
│   ├── controllers/
│   │   └── ...                # Logika bisnis untuk tiap endpoint
│   ├── middleware/
│   │   └── ...                # Middleware seperti error handler, auth, dll.
│   └── routes/
│       └─-- ...               # Definisi routing per modul/fitur
├── .env                        # Environment variables (TIDAK di-commit)
├── .gitignore                  # File/folder yang diabaikan Git
├── index.js                    # Entry point aplikasi Express
├── package.json                # Metadata proyek & dependencies
└── README.md                   # Dokumentasi proyek
```

## 📋 Prasyarat

- **Node.js** versi 18 atau lebih baru
- **npm** (biasanya sudah termasuk dalam instalasi Node.js)
- **PostgreSQL** versi 15 atau lebih baru, dengan database `absensi_magang` yang sudah dibuat

> 💡 Jika database `absensi_magang` belum ada, buat dengan perintah:
> ```sql
> CREATE DATABASE absensi_magang;
> ```

## 🚀 Cara Menjalankan

### 1. Clone repositori

```bash
git clone <url-repositori-backend>
cd Absensi-Magang-BE
```

### 2. Install dependencies

```bash
npm install
```

### 3. Konfigurasi environment variables

Buat file `.env` di root proyek dengan isi sebagai berikut:

```env
DB_USER=postgres
DB_PASSWORD=password_anda
DB_HOST=localhost
DB_PORT=5432
DB_NAME=absensi_magang
PORT=5000
```

| Variabel      | Deskripsi               | Default          |
|---------------|-------------------------|------------------|
| `DB_USER`     | Username PostgreSQL     | `postgres`       |
| `DB_PASSWORD` | Password PostgreSQL     | *(wajib diisi)*  |
| `DB_HOST`     | Host PostgreSQL         | `localhost`      |
| `DB_PORT`     | Port PostgreSQL         | `5432`           |
| `DB_NAME`     | Nama database           | `absensi_magang` |
| `PORT`        | Port server Express     | `5000`           |

> ⚠️ File `.env` berisi kredensial sensitif. File ini sudah dimasukkan ke `.gitignore` dan **tidak boleh** di-commit ke repository.

### 4. Jalankan server

**Mode development** (dengan auto-reload):
```bash
npm run dev
```

**Mode production**:
```bash
npm start
```

Server akan berjalan di `http://localhost:5000`.

## 📜 Script NPM

| Script         | Perintah           | Keterangan                            |
|----------------|--------------------|---------------------------------------|
| `npm run dev`  | `nodemon index.js` | Menjalankan server dengan hot-reload  |
| `npm start`    | `node index.js`    | Menjalankan server untuk production   |

## 🏗️ Arsitektur

Proyek ini mengikuti pola **separation of concerns** untuk menjaga kode tetap terstruktur, mudah dikembangkan, dan mudah di-maintain dalam tim. Berikut penjelasan masing-masing lapisan:

### 📂 Routes
Routes adalah tempat mendefinisikan *endpoint* HTTP (`GET`, `POST`, `PUT`, `DELETE`, dll.) untuk setiap modul atau fitur. Setiap file di folder `routes/` menangani satu kelompok endpoint terkait (misalnya: users, absensi, laporan). Routes bertugas menerima request dari client dan meneruskannya ke controller yang sesuai — tidak berisi logika bisnis.

### 🧠 Controllers
Controllers berisi logika bisnis dari setiap endpoint. Di sinilah validasi data, pemanggilan query database, dan penyusunan response dilakukan. Controller menerima `req` (request) dan `res` (response), memprosesnya, lalu mengirimkan response kembali ke client. Dengan memisahkan controller dari routes, kode tetap rapi dan setiap fungsi memiliki tanggung jawab yang jelas.

### ⚙️ Middleware
Middleware adalah fungsi perantara yang berjalan di antara request dan response. Beberapa kegunaan umum middleware:

- **Error Handler** — Menangkap dan memformat semua error menjadi response JSON yang konsisten
- **Autentikasi & Otorisasi** — Memeriksa token JWT atau session sebelum mengizinkan akses ke endpoint tertentu
- **Logging** — Mencatat setiap request yang masuk untuk keperluan debugging
- **Validasi** — Memvalidasi input body/params sebelum masuk ke controller

Middleware dapat dipasang secara global (berlaku untuk semua route) atau spesifik per route.

### 🗄️ Config
Folder `config/` berisi pengaturan koneksi database dan konfigurasi eksternal lainnya. Koneksi PostgreSQL menggunakan `pg.Pool` untuk mengelola koneksi database secara efisien dengan connection pooling.

### Alur Request

```
Client Request
    │
    ▼
Express App (index.js)
    │
    ├── cors()              ← Middleware CORS
    ├── express.json()      ← Parsing JSON body
    │
    ▼
Routes (src/routes/)
    │   Mendefinisikan endpoint & method HTTP
    │   Meneruskan ke controller
    ▼
Controllers (src/controllers/)
    │   Logika bisnis
    │   Query database
    ▼
Database (src/config/db.js)
    │   PostgreSQL via pg.Pool
    ▼
Response ke Client
```

### Format Error Response

Semua error yang terjadi di controller akan ditangkap oleh *global error handler* dan dikembalikan dalam format JSON yang konsisten:

```json
{
  "error": {
    "message": "Deskripsi error",
    "status": 500
  }
}
```

## 📦 Menambahkan Modul/Fitur Baru

Saat menambahkan fitur baru (misalnya modul `users`), cukup ikuti pola berikut:

1. Buat file di `src/controllers/` — misalnya `userController.js`
2. Buat file di `src/routes/` — misalnya `userRoutes.js`
3. Daftarkan route baru di `index.js` dengan `app.use("/api/users", userRoutes)`

Pola ini memastikan setiap fitur terisolasi dan mudah diuji secara terpisah.

## 📝 Lisensi

ISC

---

Dibangun dengan ❤️ untuk keperluan sistem absensi magang.