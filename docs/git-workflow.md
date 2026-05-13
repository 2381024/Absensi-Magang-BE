# Panduan Git Workflow — Tim Backend Absensi Magang

Panduan ini mencakup alur kerja Git harian untuk seluruh anggota tim backend. Cocok untuk **junior** maupun **senior** — yang penting satu tim punya kebiasaan yang sama.

---

## 1. Pendahuluan: Feature Branching

Kita pakai workflow **Feature Branching**. Aturan emasnya satu:

> 🚫 **Jangan pernah commit langsung ke `main`.**

Branch `main` adalah satu-satunya sumber kebenaran (source of truth). Semua kode yang ada di `main` harus dalam kondisi **stabil** dan **sudah di-review**.

Setiap kali mengerjakan fitur baru, bug fix, atau improvement, kita buat **branch baru** dari `main`, kerjain di sana, lalu ajukan **Pull Request** untuk digabungkan kembali. Ini menjaga `main` tetap bersih dan memudahkan kita melacak siapa mengerjakan apa.

```
main ──────●────────────●──────────●───── (stabil, production-ready)
            \          /          /
feature-a    ●──●──●──┘          /
feature-b                        ●──●──┘
```

---

## 2. Siklus Harian (Daily Cycle)

Ini adalah rutinitas yang kamu lakukan setiap kali mulai coding fitur baru.

### Step 1: Sinkronisasi dengan `main`

Sebelum mulai ngoding apapun, pastikan lokal kamu *up-to-date* dengan perubahan terbaru dari remote.

```bash
git checkout main
git pull origin main
```

Penjelasan:
- `git checkout main` → Pindah ke branch `main`
- `git pull origin main` → Ambil semua commit terbaru dari GitHub ke lokal kamu

> 💡 **Kenapa ini penting?** Kalau ada teammate yang sudah merge PR-nya, kamu harus punya kode terbaru itu sebelum buat branch baru. Kalau tidak, nanti bakal banyak conflict.

### Step 2: Buat Branch Baru

Beri nama branch dengan format yang deskriptif. Contoh konvensi nama branch:

```
feature/nama-fitur        → fitur baru
fix/deskripsi-bug         → perbaikan bug
refactor/deskripsi        → peningkatan kode tanpa ubah behavior
docs/deskripsi            → dokumentasi
```

```bash
git checkout -b feature/login-api
```

Penjelasan:
- `git checkout -b` → Buat branch baru **dan** langsung pindah ke branch tersebut
- Branch ini adalah copy dari `main` terbaru — aman, terisolasi, bebas kamu utak-atik

> ⚠️ **Satu branch = satu tugas.** Jangan gabung 3 fitur berbeda dalam satu branch. PR jadi susah di-review dan rawan conflict.

### Step 3: Kerjakan, Stage, dan Commit

Setelah coding selesai (atau checkpoint tertentu), simpan pekerjaan kamu:

```bash
# Cek file apa aja yang berubah
git status

# Stage file yang ingin di-commit
git add src/controllers/authController.js
git add src/routes/authRoutes.js

# Atau stage semua file sekaligus (hati-hati, jangan sampai file sensitif ikut)
git add .

# Commit dengan pesan yang jelas
git commit -m "feat: tambah endpoint login dengan JWT"
```

**Aturan pesan commit** (Conventional Commits):
```
feat: deskripsi fitur baru
fix: perbaikan bug X pada bagian Y
refactor: rapikan struktur folder controller
docs: update README cara setup
```

> 💡 **Pesan commit yang baik** bisa langsung dipahami 3 bulan kemudian tanpa harus baca ulang kodenya. "fix bug" itu bukan pesan commit yang baik. "fix: 500 error saat login dengan user nonaktif" itu jauh lebih baik.

### Step 4: Push ke Remote

Setelah commit, kirim branch kamu ke GitHub:

```bash
# Pertama kali push branch baru
git push -u origin feature/login-api

# Push berikutnya di branch yang sama (cukup)
git push
```

Penjelasan:
- `-u origin feature/login-api` → Set upstream, jadi kamu tidak perlu mengetik nama branch panjang tiap kali push
- Setelah ini, branch kamu muncul di GitHub dan siap untuk Pull Request

---

## 3. Pull Request (PR)

### Apa itu Pull Request?

PR adalah mekanisme **meminta izin** untuk menggabungkan branch kamu ke `main`. Konsepnya sederhana:

1. Kamu selesai coding di branch `feature/login-api`
2. Kamu buka PR di GitHub: "Ini hasil kerja saya, mohon di-review"
3. Teammate me-review kode kamu — kasih komentar, saran, atau approval
4. Setelah disetujui, PR di-merge ke `main`

### Cara Membuka PR

1. Push branch kamu ke GitHub (Step 4 di atas)
2. Buka repository di GitHub
3. Biasanya GitHub otomatis menampilkan banner **"Compare & pull request"** — klik itu
4. Atau manual: Tab **Pull Requests** → **New pull request**
5. Pilih **base: `main`** ← **compare: `feature/login-api`**
6. Tulis judul dan deskripsi PR yang jelas:
   - **Judul**: Singkat, deskriptif (contoh: `feat: implementasi login dengan JWT`)
   - **Deskripsi**: Apa yang dikerjakan, kenapa, bagaimana cara testing, screenshot (kalau ada)
7. Klik **Create pull request**

### Proses Review

- **Wajib**: Setiap PR harus di-review minimal **1 orang** sebelum di-merge
- Reviewer akan membaca kode kamu dan meninggalkan komentar
- Jangan tersinggung kalau dikasih masukan — review adalah proses belajar, bukan kritik personal
- Kalau ada revisi, commit lagi di branch yang sama, push, dan PR otomatis terupdate
- Setelah mendapat **approval**, yang buka PR yang merge (atau reviewer, sesuai kesepakatan tim)

---

## 4. Mengambil Update Setelah PR Di-merge

PR kamu (atau PR teman) sudah di-merge ke `main`. Sekarang kamu harus sinkronisasi ulang.

```bash
# Pindah ke main
git checkout main

# Tarik update terbaru
git pull origin main
```

**Setelah itu, kalau kamu sedang mengerjakan branch lain**, ada dua skenario:

### Kalau branch kamu BELUM terpengaruh
Lanjutkan kerja seperti biasa. Tapi begitu tugas berikutnya, **buat branch baru dari `main` yang sudah terupdate**.

### Kalau branch kamu sedang aktif dan butuh update dari `main`

```bash
# Pindah ke branch kamu
git checkout feature/sedang-dikerjakan

# Gabungkan update dari main ke branch kamu
git merge main
```

Ini akan menggabungkan perubahan terbaru dari `main` ke branch kamu. Kalau muncul conflict → lanjut ke Section 5.

---

## 5. Menangani Merge Conflict

### Tenang, conflict itu normal.

Merge conflict terjadi ketika dua branch mengubah **baris yang sama** di **file yang sama**, dan Git bingung versi mana yang harus dipakai. Ini bukan kesalahan — ini bagian wajar dari kerja tim.

Contoh situasi: Kamu dan teman sama-sama mengubah `index.js` baris 15. Teman sudah merge duluan. Sekarang kamu merge `main` ke branch kamu → conflict.

### Cara Resolve di VSCode

Saat conflict muncul, VSCode menampilkan tampilan seperti ini:

```
<<<<<<< HEAD (Current Change)
app.use("/api/auth", authRoutes);
=======
app.use("/api/v2/auth", authRoutes);
>>>>>>> main (Incoming Change)
```

Keterangan:
- **Current Change** — Kode dari branch **kamu**
- **Incoming Change** — Kode dari branch **main** (milik teman)

Kamu bisa klik salah satu opsi di atas kode:
- **Accept Current Change** → Pakai punya kamu
- **Accept Incoming Change** → Pakai punya teman
- **Accept Both Changes** → Gabung keduanya (hati-hati)
- **Compare Changes** → Lihat perbedaan side-by-side

### Langkah-langkah:

1. **Buka Source Control** tab di VSCode (Ctrl+Shift+G)
2. File yang conflict ditandai dengan huruf **C**
3. Buka file tersebut satu per satu
4. Pilih resolusi yang tepat untuk setiap conflict
5. Setelah SEMUA conflict teresolve:

```bash
# Stage file yang sudah di-resolve
git add .

# Commit hasil merge
git commit -m "merge: resolve conflict dari main ke feature/login-api"

# Push branch yang sudah bersih dari conflict
git push
```

> ⚠️ **Jangan panik.** Kamu tidak akan merusak apapun. Selama belum di-push, semua masih bisa di-undo. Kalau benar-benar bingung:
> ```bash
> git merge --abort
> ```
> Perintah ini membatalkan merge dan mengembalikan branch kamu ke kondisi sebelum conflict. Lega, kan?

---

## Ringkasan Perintah Penting

| Perintah | Fungsi |
|---|---|
| `git status` | Cek status file (modified, staged, untracked) |
| `git pull origin main` | Ambil update terbaru dari remote `main` |
| `git checkout -b nama-branch` | Buat & pindah ke branch baru |
| `git checkout nama-branch` | Pindah ke branch yang sudah ada |
| `git add .` atau `git add <file>` | Stage perubahan |
| `git commit -m "pesan"` | Simpan perubahan ke history lokal |
| `git push` atau `git push -u origin nama-branch` | Kirim branch ke GitHub |
| `git merge main` | Gabungkan `main` ke branch aktif |
| `git branch` | Lihat semua branch lokal |
| `git log --oneline` | Lihat history commit singkat |
| `git merge --abort` | Batalkan merge yang sedang conflict |

---

## Checklist Sebelum Push / PR

- [ ] Apakah aku sudah `git pull origin main` sebelum buat branch?
- [ ] Apakah nama branch-ku deskriptif? (`feature/...`, `fix/...`, `refactor/...`)
- [ ] Apakah pesan commit-ku jelas mengikuti format Conventional Commits?
- [ ] Apakah aku sudah hapus `console.log` debug / komentar tidak perlu?
- [ ] Apakah kodeku sudah dites lokal dan tidak error?
- [ ] Apakah ada file sensitif (`.env`, `node_modules`) yang tidak sengaja ter-stage?
- [ ] Apakah deskripsi PR sudah jelas — apa, kenapa, cara testing?

---

## Mental Model

> Kerjakan di branch kamu → Ajukan PR → Review → Merge → Sync ulang → Ulangi.

Ini adalah siklus yang terus berulang. Makin sering kamu praktikkan, makin jadi kebiasaan. Dalam 1-2 minggu kamu sudah tidak perlu lirik panduan ini lagi 😄

---

Punya pertanyaan atau stuck? Tanya di channel tim atau langsung ke tech lead. Tidak ada pertanyaan bodoh — kita semua pernah mulai dari nol.