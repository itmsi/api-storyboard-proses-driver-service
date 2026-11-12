# Alur Pemakaian OGO Logistik

Panduan dari perusahaan baru sampai pemakaian harian: siapa melakukan apa, ke endpoint mana, dengan syarat apa, dan apa yang terjadi bila ditolak. Ditulis untuk tim front end (web admin dan aplikasi HP driver) dan untuk pembaca non-teknis yang perlu memahami alurnya. Detail skema tiap field ada di Swagger (`/documentation`).

```
HP driver / Web admin ──> API logistik (service ini) ──> saas-api   (minta kredensial database client)
                                   │
                                   ├──> Database client (PostgreSQL, satu database per perusahaan)
                                   └──> Nextcloud            (semua foto)
```

**Daftar isi**

0. [Ringkasan alur dari awal sampai akhir](#0-ringkasan-alur-dari-awal-sampai-akhir)
1. [Aturan umum API](#1-aturan-umum-api)
2. [Login, token, dan sesi](#2-login-token-dan-sesi)
3. [Perusahaan baru (MSI, lewat saas-api)](#3-perusahaan-baru-msi-lewat-saas-api)
4. [Role dan hak akses](#4-role-dan-hak-akses)
5. [Menyiapkan data kerja (admin)](#5-menyiapkan-data-kerja-admin)
6. [Penugasan unit harian (assign unit ke driver)](#6-penugasan-unit-harian-assign-unit-ke-driver)
7. [Membuat delivery order (admin)](#7-membuat-delivery-order-admin)
8. [Satu hari kerja driver (aplikasi HP)](#8-satu-hari-kerja-driver-aplikasi-hp)
9. [Setelah DO selesai (admin)](#9-setelah-do-selesai-admin)
10. [Status DO dan langkah yang diizinkan](#10-status-do-dan-langkah-yang-diizinkan)
11. [Daftar kode error](#11-daftar-kode-error)
12. [Daftar lengkap endpoint dan hak yang dibutuhkan](#12-daftar-lengkap-endpoint-dan-hak-yang-dibutuhkan)
13. [Penyimpanan foto](#13-penyimpanan-foto)
14. [Konfigurasi penting (`.env`)](#14-konfigurasi-penting-env)
15. [Belum ada](#15-belum-ada)

---

## 0. Ringkasan alur dari awal sampai akhir

Urutan ini wajib diikuti karena tiap langkah membutuhkan data dari langkah sebelumnya.

| # | Siapa | Langkah | Endpoint | Butuh data dari |
|---|---|---|---|---|
| 1 | MSI | Buat perusahaan (client) dan database | saas-api + `/internal/...` | - |
| 2 | MSI | Login dengan akun `msi.support` | `POST /auth/login` | `client_code` dari langkah 1 |
| 3 | Admin | Buat role admin lain (opsional) | `POST /roles` | - |
| 4 | Admin | Buat akun admin perusahaan | `POST /users` | `role_id` dari langkah 3 (opsional) |
| 5 | Admin | Buat tipe unit | `POST /unit-types` | - |
| 6 | Admin | Buat unit (kendaraan) | `POST /units` | `unit_type_id` dari langkah 5 |
| 7 | Admin | Buat customer | `POST /customers` | - |
| 8 | Admin | Buat lokasi (gudang, depot, tujuan customer) | `POST /locations` | `customer_id` dari langkah 7 (untuk `customer_site`) |
| 9 | Admin | Atur checklist P2H, kategori biaya, pengaturan | `POST /p2h-items`, `POST /expense-categories`, `PUT /settings` | - |
| 10 | Admin | Buat akun driver | `POST /drivers` | `role_id` driver (opsional) |
| 11 | Admin | **Assign unit ke driver** untuk tanggal kerja | `POST /unit-assignments` | `driver_id` (langkah 10), `unit_id` (langkah 6) |
| 12 | Admin | Buat delivery order (DO) | `POST /delivery-orders` | driver, unit (**sama dengan langkah 11**), lokasi, customer |
| 13 | Driver | Login di HP | `POST /auth/login` | kode driver / No. HP + password dari langkah 10 |
| 14 | Driver | Ambil konfigurasi dan layar awal | `GET /config`, `GET /app/bootstrap` | - |
| 15 | Driver | P2H unit hari ini | `POST /units/{unitId}/p2h` | **wajib ada assignment langkah 11** |
| 16 | Driver | Terima DO | `POST /delivery-orders/{id}/accept` | **wajib P2H langkah 15 layak** |
| 17 | Driver | Muat barang | `POST /delivery-orders/{id}/loading` | foto dari `POST /media` |
| 18 | Driver | Odometer awal, mulai jalan | `POST /delivery-orders/{id}/odometer` (`start`) | - |
| 19 | Driver | Catat biaya (BBM, tol, parkir) | `POST /delivery-orders/{id}/expenses` | - |
| 20 | Driver | Serah terima di tujuan | `POST /delivery-orders/{id}/handover` | - |
| 21 | Driver | Odometer akhir | `POST /delivery-orders/{id}/odometer` (`end`) | - |
| 22 | Driver | Lihat ringkasan dan selesaikan DO | `GET .../summary`, `POST .../complete` | - |
| 23 | Admin | Periksa DO, P2H, biaya; lunasi rekap uang jalan | `/delivery-orders`, `/p2h`, `/expenses`, `/settlements` | - |

Rantai syarat yang paling sering membuat bingung:

```
Assign unit (admin) ──> P2H unit (driver) ──> Terima DO (driver) ──> Muat ──> Odometer awal ──> Serah terima ──> Odometer akhir ──> Selesai
     │                       │                       │
     │                       │                       └─ ditolak P2H_REQUIRED bila unit DO belum P2H layak hari ini
     │                       └─ ditolak FORBIDDEN bila driver tidak di-assign ke unit itu hari ini
     └─ tanpa assignment, aplikasi HP tidak punya unit_today dan driver tidak bisa P2H
```

---

## 1. Aturan umum API

- **Base URL** `/api/v1`. Contoh: `https://<host>/api/v1/auth/login`.
- **Header** untuk endpoint yang butuh login: `Authorization: Bearer <access_token>`.
- **Bahasa pesan error** mengikuti header `Accept-Language` (`id`, `en`, `zh`; bawaan `id`).
- **Respons sukses**:
  ```json
  { "success": true, "data": { ... }, "meta": { ... } }
  ```
  `meta` hanya ada di daftar (pagination).
- **Respons error**:
  ```json
  {
    "success": false,
    "error": {
      "code": "VALIDATION_ERROR",
      "message": "Data tidak lengkap.",
      "http_status": 422,
      "details": [ { "field": "work_date", "message": "Tanggal penugasan tidak boleh sebelum hari ini." } ]
    }
  }
  ```
  FE sebaiknya memakai `error.code` untuk logika dan `error.message` untuk ditampilkan. `details` berisi daftar field yang salah (untuk `VALIDATION_ERROR`) atau keterangan tambahan (untuk error lain). Daftar kode ada di [bagian 11](#11-daftar-kode-error).
- **Status HTTP sukses**: `200` (berhasil / data sudah ada), `201` (data baru dibuat).
- **ID**: semua `id` adalah UUID. Ganti contoh di dokumen ini dengan id sebenarnya dari respons endpoint sebelumnya.
- **Waktu**: ISO 8601 dengan zona waktu (contoh `2026-11-12T08:30:00+07:00`). **Tanggal**: `YYYY-MM-DD`. "Hari ini" selalu dihitung dengan zona WIB (Asia/Jakarta). Waktu dari HP tidak boleh lebih dari 5 menit di masa depan.
- **`client_ref`**: UUID v4 yang dibuat HP untuk satu aksi driver. Mengirim ulang aksi yang sama (misal jaringan putus) aman: server mengenali `client_ref` yang sama dan tidak membuat data ganda.
- **Daftar data** memakai `POST /<modul>/get` dengan filter di body (semua field opsional, body boleh `{}`):
  ```json
  { "page": 1, "limit": 20, "search": "budi", "sort": "-created_at" }
  ```
  `limit` maksimal 100. Awalan `-` pada `sort` = urutan menurun. Respons:
  ```json
  { "success": true, "data": [ ... ], "meta": { "page": 1, "limit": 20, "total": 57, "total_pages": 3 } }
  ```
- **Batas permintaan**: 300 request/menit per IP untuk semua endpoint; 20 request/15 menit per IP untuk login dan refresh. Melebihi batas = `429 RATE_LIMITED`.
- **Password** akun yang dibuat atau diubah: minimal 8 karakter, wajib ada huruf dan angka. Bila password dikosongkan saat membuat akun atau reset, server membuat password sementara dan mengembalikannya **sekali saja** di respons.

---

## 2. Login, token, dan sesi

Satu endpoint login untuk dua jenis akun. Jenis akun ditentukan oleh **role** akun itu (`roles.user_type`), bukan oleh aplikasi yang dipakai.

| | Admin (web) | Driver (aplikasi HP) |
|---|---|---|
| Dibuat lewat | `POST /users` | `POST /drivers` |
| Disimpan di tabel | `users` | `users` (login) + `drivers` (profil kerja) |
| Role | role dengan `user_type: admin` (bawaan: **Administrator**) | role dengan `user_type: driver` (bawaan: **Driver**) |
| `username` saat login | username atau email | kode driver (`DRV-0021`) atau No. HP |
| `device` saat login | tidak dikirim | **wajib** |
| Objek di respons login | `admin` | `driver` |

### Syarat akun bisa login

1. `client_code` benar dan perusahaan aktif (selain itu `INVALID_CLIENT_CODE` atau `CLIENT_INACTIVE`).
2. Username dan password cocok (selain itu `INVALID_CREDENTIALS` dengan `details.remaining_attempts`).
3. Akun tidak sedang terkunci. Setelah **5 kali** password salah berturut-turut akun dikunci **15 menit** (`423 ACCOUNT_LOCKED`, `details.locked_until`). Admin dapat membuka kunci driver lebih cepat lewat `POST /drivers/{id}/unlock`.
4. Status akun `active`. Untuk driver, status profil driver juga harus `active`. Akun `suspended` = `403 FORBIDDEN` walau password benar.
5. Driver wajib mengirim `device` (selain itu `422 VALIDATION_ERROR` di field `device`).
6. Role akun aktif. Role yang dinonaktifkan membuat semua endpoint membalas `403 FORBIDDEN` (`details.reason: role_nonaktif`).

### Login driver

`POST /auth/login` (tanpa token)
```json
{
  "client_code": "OGO",
  "username": "DRV-0021",
  "password": "PasswordAwal1",
  "device": { "device_id": "android-3f9a1c", "app_version": "1.0.0", "os": "Android 14" },
  "remember_me": true
}
```
- `client_code`: kode perusahaan yang diberikan MSI (huruf besar, angka, `_`, `-`). Aplikasi HP biasanya menyimpannya setelah login pertama.
- `device.device_id`: ID unik perangkat yang stabil (tidak berubah tiap buka aplikasi).
- `remember_me`: `true` = sesi 30 hari, `false` = 1 hari (bawaan `true`).

Respons `200`:
```json
{
  "success": true,
  "data": {
    "access_token": "eyJhbGciOi...",
    "refresh_token": "T0dP.q8Zs1...",
    "expires_in": 86400,
    "driver": {
      "id": "3b9e6f10-5c4d-4a72-8e1b-7d2c9a0f4e55",
      "code": "DRV-0021",
      "name": "Andi Pratama",
      "phone": "081234567890",
      "role": { "id": "…", "name": "Driver", "is_system": true },
      "permissions": {
        "driver_profile": ["read", "update"],
        "driver_delivery_orders": ["read", "update"],
        "driver_p2h": ["read", "create"],
        "driver_trip": ["create"],
        "driver_expenses": ["read", "create"],
        "driver_media": ["read", "create"],
        "driver_sync": ["create"],
        "driver_device": ["create"]
      }
    }
  }
}
```
`driver.id` adalah `drivers.id`, yaitu id yang dipakai di `/drivers/{id}`, `/unit-assignments`, dan `/delivery-orders`.

### Login admin

Bentuk sama, **tanpa** `device`:
```json
{ "client_code": "OGO", "username": "dewi.admin", "password": "PasswordAwal1" }
```
Respons `200`:
```json
{
  "success": true,
  "data": {
    "access_token": "eyJhbGciOi...",
    "refresh_token": "T0dP.Xk3p...",
    "expires_in": 86400,
    "admin": {
      "id": "9f0e…",
      "username": "dewi.admin",
      "name": "Dewi Admin",
      "email": "dewi@contoh.co.id",
      "role": { "id": "…", "name": "Staf Operasional", "is_system": false },
      "permissions": { "units": ["read", "create", "update"], "unit_assignments": ["read", "create", "update"] }
    }
  }
}
```
Pakai `permissions` untuk menyembunyikan menu atau tombol yang tidak diizinkan. Server tetap memeriksa hak di setiap request, dan perubahan role berlaku seketika tanpa login ulang. Role **Administrator** memegang semua hak.

### Masa berlaku token dan refresh

| Token | Berlaku | Keterangan |
|---|---|---|
| `access_token` | 24 jam (`expires_in` detik) | dikirim di header `Authorization` |
| `refresh_token` | 30 hari (`remember_me: true`) / 1 hari (`false`) | hanya untuk `POST /auth/refresh` |

Bila request membalas `401 TOKEN_EXPIRED` (`details.refresh: true`):
1. Panggil `POST /auth/refresh` dengan `{ "refresh_token": "<refresh_token terakhir>" }`.
2. Simpan **pasangan token baru** dari respons (bentuknya sama dengan login, tanpa `driver`/`admin`). Refresh token lama langsung tidak berlaku.
3. Ulangi request yang tadi gagal.

Bila refresh membalas `401 UNAUTHORIZED`, arahkan ke layar login. Ini terjadi bila refresh token kedaluwarsa, akun dinonaktifkan, password direset admin, atau refresh token lama dipakai ulang (dianggap dicuri sehingga semua sesi turunannya dicabut).

### Keluar

`POST /auth/logout` (dengan token, body kosong). Respons driver: `{ "logged_out": true, "pending_sync_warning": false }`. Bila `pending_sync_warning: true`, masih ada data offline yang gagal terkirim; sebaiknya tampilkan peringatan sebelum keluar.

### Profil dan password driver (aplikasi HP)

| Endpoint | Body | Fungsi |
|---|---|---|
| `GET /me` | - | Profil driver, unit hari ini, data sinkron yang tertunda |
| `PUT /me/settings` | `{ "language": "en" }` (`id`, `en`, `zh`) | Ganti bahasa aplikasi |
| `POST /me/password` | `{ "current_password": "...", "new_password": "PasswordBaru1" }` | Ganti password sendiri |
| `POST /devices/push-token` | `{ "device_id": "android-3f9a1c", "fcm_token": "..." }` | Simpan token notifikasi push |

Admin mengganti password akunnya lewat `POST /users/{id}/reset-password` dengan id akunnya sendiri.

---

## 3. Perusahaan baru (MSI, lewat saas-api)

1. Admin MSI membuat client di saas-api (`POST /clients`) dan mendapat `client_code`.
2. Worker saas-api membuat database dan dua role Postgres (owner untuk DDL, app untuk DML), lalu memanggil API ini di `/internal` dengan header `X-Internal-Key: <INTERNAL_PROVISIONING_KEY>`:

   ```
   POST /internal/tenants/{client_id}/migrate        body: { "target": "latest" }
   POST /internal/tenants/{client_id}/seed           body: { "include_system_user": true }
   GET  /internal/tenants/{client_id}/verify
   POST /internal/tenants/{client_id}/system-user/reset
   GET  /internal/migrations/status
   ```
   Respons `migrate`: `{ "schema_version": "20261110001700_roles_permissions", "applied": [...], "duration_ms": 840 }`.
   Respons `seed`: `{ "seeded": ["system_user:created"], "duration_ms": 120 }`.
   Respons `verify`: `{ "ok": true, "schema_version": "...", "checks": { "app_role_login": true, "migrations_up_to_date": true, "tables": true, "system_user": true } }`.

3. Orang MSI mengambil password `msi.support` (saas-api: `POST /clients/{id}/reveal-system-user`, hanya superadmin), lalu login ke API ini sebagai admin ([bagian 2](#login-admin)).
4. Dengan akun itu mereka membuat role dan admin pertama perusahaan ([bagian 4](#4-role-dan-hak-akses)).

Catatan:
- `msi.support` selalu berperan **Administrator** (semua hak), tidak tampil di daftar `/users`, dan tidak bisa mengganti passwordnya sendiri (password hanya berubah lewat saas-api: `reset-system-user`).
- Seed juga menyiapkan role bawaan **Administrator** dan **Driver**, serta 7 tipe unit awal (`CDD_BAK`, `CDD_BOX`, `FUSO_BAK`, `FUSO_BOX`, `TRONTON`, `WINGBOX`, `TRAILER`).
- Rollout migrasi ke semua client dilakukan dari saas-api (`POST /migrations/rollout`), bukan dari service ini.

---

## 4. Role dan hak akses

- Setiap akun (admin dan driver) punya satu role. Role berisi hak `read`, `create`, `update`, `delete` per modul.
- Setiap role punya `user_type`: `admin` (web admin) atau `driver` (aplikasi HP). Role admin hanya bisa dipasang ke akun admin, role driver hanya ke akun driver.
- Role bawaan **Administrator** (admin): semua hak, tidak bisa diubah atau dihapus.
- Role bawaan **Driver** (driver): semua hak driver; hak dan deskripsinya boleh disesuaikan, tidak bisa dihapus.
- Admin hanya bisa memberi hak yang dimilikinya sendiri, dan tidak bisa mengelola akun yang haknya di atasnya.
- Perubahan hak berlaku seketika tanpa login ulang.
- Tanpa hak: `403 FORBIDDEN` dengan `details.required = "<modul>:<aksi>"`.

### Cara menentukan aksi yang dibutuhkan endpoint admin

| Request | Aksi |
|---|---|
| `GET ...` dan `POST /<modul>/get` (daftar) | `read` |
| `POST /<modul>` (buat baru) | `create` |
| `PUT ...` | `update` |
| `DELETE ...` | `delete` |
| `POST /<modul>/{id}/<tindakan>` (cancel, void, settle, reset-password, unlock, recheck) | `update` |

Contoh: `POST /unit-assignments` butuh `unit_assignments:create`, `PUT /unit-assignments` butuh `unit_assignments:update`, `POST /unit-assignments/get` butuh `unit_assignments:read`. Daftar per endpoint ada di [bagian 12](#12-daftar-lengkap-endpoint-dan-hak-yang-dibutuhkan).

**Modul hak admin:** `drivers`, `users`, `roles`, `unit_types`, `units`, `customers`, `locations`, `unit_assignments`, `delivery_orders`, `expenses`, `settlements`, `p2h`, `media`, `p2h_items`, `expense_categories`, `settings`.

**Modul hak driver** (role Driver bawaan memegang semuanya):

| Modul | Aksi | Mencakup |
|---|---|---|
| `driver_profile` | read, update | `/config`, `/app/bootstrap`, `/me` (read); pengaturan dan password (update) |
| `driver_delivery_orders` | read, update | daftar, aktif, riwayat, detail, ringkasan DO (read); terima dan selesaikan DO (update) |
| `driver_p2h` | read, create | template dan P2H hari ini (read); kirim P2H (create) |
| `driver_trip` | create | muat, odometer, serah terima |
| `driver_expenses` | read, create | daftar dan catat biaya |
| `driver_media` | read, create | upload dan lihat foto sendiri |
| `driver_sync` | create | `POST /sync/batch` (tiap item juga diperiksa terhadap hak endpoint aslinya) |
| `driver_device` | create | token push |

Role driver wajib memuat `driver_profile:read`; tanpa itu aplikasi HP tidak bisa dibuka.

### Endpoint role

**Katalog modul dan aksi** (untuk menggambar matriks centang hak di layar): `GET /roles/catalog`.

**Buat role** `POST /roles` (`user_type` bawaan `admin`):
```json
{
  "name": "Staf Operasional",
  "code": "operasional",
  "description": "Mengelola unit, penugasan, dan DO",
  "permissions": {
    "units": ["read", "create", "update"],
    "drivers": ["read"],
    "unit_assignments": ["read", "create", "update", "delete"],
    "delivery_orders": ["read", "create", "update"]
  },
  "is_active": true
}
```
Role driver: `{ "name": "Driver Magang", "user_type": "driver", "permissions": { "driver_profile": ["read"], "driver_p2h": ["read", "create"] } }`.
`code` boleh dikosongkan (dibuat dari nama). Modul atau aksi yang tidak dikenal ditolak 422.

- **Ubah** `PUT /roles/{id}` (kirim hanya yang berubah): `{ "permissions": { "units": ["read"] }, "is_active": true }`.
- **Daftar** `POST /roles/get`: `{ "search": "staf", "is_active": true }`. **Detail** `GET /roles/{id}`.
- **Hapus** `DELETE /roles/{id}` (ditolak 409 bila masih dipakai akun).

### Akun admin perusahaan

**Buat admin** `POST /users`:
```json
{
  "name": "Dewi Admin",
  "username": "dewi.admin",
  "email": "dewi@contoh.co.id",
  "phone": "081234567890",
  "role_id": "9a1c3e55-2b7d-4f80-b6a4-1d5e8c7f2a90",
  "password": "PasswordAwal1"
}
```
- Wajib: `name`, `username` (3-60 karakter: huruf, angka, `.`, `_`, `-`), `email`. Username, email, dan No. HP harus unik.
- `role_id` harus role `user_type: admin` yang aktif. Kosong = role Administrator (hanya boleh oleh admin dengan hak setara).
- `password` kosong = dibuatkan password sementara (`initial_password` di respons, tampilkan sekali ke admin).

Lainnya:
- **Ubah** `PUT /users/{id}`: `{ "name": "Dewi A.", "status": "suspended", "role_id": "<id role lain>" }`. Status `suspended` langsung mengakhiri semua sesi akun itu.
- **Reset password** `POST /users/{id}/reset-password`: `{ "password": "PasswordBaru1" }` (kosong = dibuatkan sementara, `temporary_password` di respons).
- **Daftar** `POST /users/get`: `{ "status": "active", "role_id": "..." }`. **Detail** `GET /users/{id}`. **Hapus** `DELETE /users/{id}`.
- Penjagaan: admin tidak bisa menonaktifkan atau menghapus akunnya sendiri, dan harus selalu tersisa minimal satu admin aktif dengan role Administrator.

---

## 5. Menyiapkan data kerja (admin)

Semua master data memakai pola endpoint yang sama:

| Aksi | Endpoint | Hak |
|---|---|---|
| Daftar | `POST /<modul>/get` | `read` |
| Detail | `GET /<modul>/{id}` | `read` |
| Buat | `POST /<modul>` | `create` |
| Ubah (parsial) | `PUT /<modul>/{id}` | `update` |
| Hapus (hapus lunak) | `DELETE /<modul>/{id}` | `delete` |

### Tipe unit

`POST /unit-types`
```json
{ "code": "CDD_BAK", "name": "CDD Bak", "max_load_kg": 2500 }
```
`code` 2-30 karakter (huruf besar, angka, `_`, `-`), unik, **tidak bisa diubah** setelah dibuat. Hapus ditolak bila masih dipakai unit aktif.

### Unit (kendaraan)

`POST /units`
```json
{
  "plate": "B 9123 KZ",
  "unit_type_id": "3b9e6f10-5c4d-4a72-8e1b-7d2c9a0f4e55",
  "brand": "Mitsubishi",
  "year": 2022,
  "last_odometer_km": 45000,
  "status": "active",
  "stnk_expires_on": "2027-05-01",
  "kir_expires_on": "2027-02-15"
}
```
- Wajib: `plate`, `unit_type_id`.
- Plat dinormalisasi ke bentuk baku (`b-9123-kz` menjadi `B 9123 KZ`) dan harus unik.
- `status`: `active`, `maintenance`, `inactive`. **Hanya unit `active` yang bisa di-assign dan dipakai di DO.**
- Respons berisi `stnk_expired` / `kir_expired` (penanda saja, tidak memblokir).
- Mengubah status ke selain `active` atau menghapus unit ditolak bila unit masih dipakai DO yang belum selesai atau masih punya penugasan hari ini / ke depan.
- Filter daftar: `{ "status": "active", "unit_type_id": "..." }`.

### Customer

`POST /customers`
```json
{ "code": "CUST-001", "name": "PT Contoh Jaya", "phone": "021-5550100", "email": "ops@contohjaya.co.id" }
```
`code` unik dan tidak bisa diubah. Hapus ditolak bila customer masih punya DO berjalan atau lokasi aktif.

### Lokasi

`POST /locations`. Aturan: `warehouse` dan `depot` **tidak boleh** punya `customer_id`; `customer_site` **wajib** punya `customer_id`. `lat`/`lng` boleh kosong, tetapi bila diisi harus berpasangan.
```json
{
  "type": "warehouse",
  "name": "Gudang Cakung",
  "address": "Jl. Raya Cakung Cilincing, Jakarta Timur",
  "city": "Cakung",
  "lat": -6.18,
  "lng": 106.94,
  "geofence_radius_m": 200,
  "operating_hours": "08:00-17:00",
  "pic_name": "Pak Rudi",
  "pic_phone": "081200000000"
}
```
```json
{
  "type": "customer_site",
  "customer_id": "7d2c9a0f-4e55-4a72-8e1b-3b9e6f105c4d",
  "name": "Pabrik Maju",
  "address": "Kawasan Industri Karawang",
  "city": "Karawang"
}
```
`geofence_radius_m` bawaan 200 (10-5000). `operating_hours` format `HH:mm-HH:mm`. Filter daftar: `{ "type": "customer_site", "customer_id": "..." }`. Mengubah lokasi tidak mengubah DO lama (DO menyimpan salinan alamat).

### Akun driver

`POST /drivers`
```json
{
  "name": "Andi Pratama",
  "phone": "081234567890",
  "code": "DRV-0021",
  "role_id": "<id role driver, opsional>",
  "license_no": "1234-5678-9012",
  "license_type": "B2 Umum",
  "license_expires_on": "2028-03-01",
  "password": "PasswordAwal1"
}
```
- Wajib hanya `name`.
- `code` kosong = otomatis `DRV-0001`, `DRV-0002`, ... **Kode ini menjadi username login driver.** No. HP (bila diisi, harus unik) juga bisa dipakai untuk login.
- `role_id` harus role `user_type: driver`. Kosong = role bawaan Driver. Role admin ditolak.
- `password` kosong = password sementara (`initial_password` di respons, berikan ke driver).
- Server membuat dua baris: `users` (login) dan `drivers` (profil kerja). **Id di respons adalah `drivers.id`**; id inilah yang dipakai di penugasan unit dan DO.

Lainnya:
- **Daftar** `POST /drivers/get`: `{ "status": "active", "role_id": "...", "search": "andi" }`. Setiap driver menampilkan `unit_today` (unit yang di-assign hari ini) dan `locked`.
- **Detail** `GET /drivers/{id}` (termasuk `active_do`).
- **Ubah** `PUT /drivers/{id}`: `{ "status": "suspended" }` (sesi di HP langsung tidak bisa diperpanjang).
- **Reset password** `POST /drivers/{id}/reset-password`: `{ "password": "..." }` (semua perangkat harus login ulang).
- **Buka kunci** `POST /drivers/{id}/unlock` (setelah terlalu banyak salah password).
- **Hapus** `DELETE /drivers/{id}` (ditolak bila masih punya DO berjalan).

### Konfigurasi

`POST /p2h-items` (item checklist P2H)
```json
{ "code": "klakson", "label": "Klakson", "hint": "Berbunyi normal", "is_critical": false, "sort_order": 5, "is_active": true }
```
`is_critical: true` = item tidak sesuai membuat status P2H `tidak_layak` (unit tidak boleh jalan). Endpoint item memakai `code`, bukan id: `GET/PUT/DELETE /p2h-items/{code}`.

`POST /expense-categories`
```json
{ "code": "tol", "label": "Tol", "input": "manual", "description_required": true, "proof_required": false, "sort_order": 2 }
```
`input`: `receipt_ocr` (struk dibaca OCR di HP, misalnya BBM) atau `manual` (isi nominal). Endpoint: `GET/PUT/DELETE /expense-categories/{code}`.

`GET /settings` untuk membaca, `PUT /settings` untuk mengubah (kirim hanya kelompok yang berubah):
```json
{
  "modules": { "receipt_ocr": true, "odometer_ocr": true, "travel_allowance": true },
  "photo_rules": {
    "loading": { "min": 2, "max": 10 },
    "unloading": { "min": 1, "max": 10 },
    "delivery_note_pages": { "min": 1, "max": 5 },
    "p2h_body": { "required_sides": ["depan", "kanan", "kiri", "belakang"] }
  },
  "p2h": { "valid_until_local": "23:59" },
  "correction_reason_required": true,
  "languages": ["id", "en"],
  "default_language": "id"
}
```
Setiap perubahan konfigurasi menaikkan `config_version`, sehingga aplikasi HP mengambil ulang `GET /config`. `DELETE` untuk item checklist dan kategori biaya adalah hapus lunak (kode tidak bisa dipakai ulang).

---

## 6. Penugasan unit harian (assign unit ke driver)

Penugasan menentukan **unit mana yang dibawa seorang driver pada tanggal tertentu**. Data disimpan di tabel `driver_unit_assignments`.

**Siapa:** admin dengan hak `unit_assignments` (Administrator punya semuanya).

**Kenapa penting:** penugasan adalah syarat pertama hari kerja driver.
- Tanpa penugasan hari ini, `unit_today` di aplikasi HP kosong.
- Driver hanya boleh P2H unit yang di-assign kepadanya hari ini (selain itu `403 FORBIDDEN`).
- DO baru bisa diterima bila unit DO sudah P2H layak hari ini.

### Aturan

| Aturan | Akibat bila dilanggar |
|---|---|
| Satu driver hanya punya **satu unit per tanggal**. Mengirim lagi untuk driver dan tanggal yang sama akan **mengganti unitnya**. | - (bukan error, data ditimpa) |
| Satu unit **boleh** dipakai beberapa driver pada tanggal yang sama. | - |
| `work_date` hari ini atau ke depan (WIB). | `422`, field `work_date` |
| Driver ada dan berstatus aktif. | `422`, field `driver_id` |
| Unit ada dan berstatus `active` (bukan `maintenance` / `inactive`). | `422`, field `unit_id` |
| Penugasan tidak bisa diganti unitnya atau dicabut bila driver **sudah mulai bekerja** dengan unit itu: sudah P2H unit itu di tanggal tsb, atau punya DO berjalan dengan unit itu. | `409 CONFLICT`, `details.reason: sudah_bekerja` |

### Langkah di web admin

1. Ambil daftar driver aktif: `POST /drivers/get` dengan `{ "status": "active" }`. Simpan `id` driver.
2. Ambil daftar unit aktif: `POST /units/get` dengan `{ "status": "active" }`. Simpan `id` unit.
3. Kirim penugasan.
4. Tampilkan daftar penugasan tanggal itu untuk konfirmasi.

### Buat atau ganti penugasan

`POST /unit-assignments` (hak `unit_assignments:create`) atau `PUT /unit-assignments` (hak `unit_assignments:update`). Keduanya berperilaku sama (buat baru atau timpa).
```json
{
  "driver_id": "3b9e6f10-5c4d-4a72-8e1b-7d2c9a0f4e55",
  "unit_id": "fc06e493-e9c6-429b-9529-bc07084818ee",
  "work_date": "2026-11-12"
}
```
`driver_id` adalah `drivers.id` (id dari `/drivers`), bukan id akun `users`.

Respons:
- `201` = penugasan baru dibuat.
- `200` = penugasan yang ada diganti unitnya, atau data yang dikirim sama persis dengan yang ada (aman dikirim berulang).

```json
{
  "success": true,
  "data": {
    "id": "a7c1…",
    "work_date": "2026-11-12",
    "driver": { "id": "3b9e6f10-…", "code": "DRV-0021", "name": "Andi Pratama" },
    "unit": { "id": "fc06e493-…", "plate": "B 9123 KZ", "type": "CDD Bak" },
    "created_at": "2026-11-11T16:00:00+07:00",
    "created_by": { "id": "…", "name": "Dewi Admin" },
    "updated_at": "2026-11-11T16:00:00+07:00",
    "updated_by": { "id": "…", "name": "Dewi Admin" }
  }
}
```

Contoh penolakan ganti unit:
```json
{
  "success": false,
  "error": {
    "code": "CONFLICT",
    "message": "Penugasan tidak bisa diganti: P2H unit ini sudah dibuat pada 2026-11-12.",
    "http_status": 409,
    "details": { "reason": "sudah_bekerja", "p2h": true }
  }
}
```

### Lihat, detail, cabut

- **Daftar** `POST /unit-assignments/get`: `{ "date": "2026-11-12", "driver_id": "...", "unit_id": "...", "search": "B 9123" }`. Tanpa `date` = hari ini. `search` mencari nama driver, kode driver, atau plat. `sort`: `driver`, `plate`, `created_at`.
- **Detail** `GET /unit-assignments/{id}`.
- **Cabut** `DELETE /unit-assignments/{id}` (hak `unit_assignments:delete`). Data dihapus permanen. Ditolak `409 sudah_bekerja` dengan aturan yang sama seperti ganti unit.

---

## 7. Membuat delivery order (admin)

`POST /delivery-orders` (hak `delivery_orders:create`)
```json
{
  "driver_id": "3b9e6f10-5c4d-4a72-8e1b-7d2c9a0f4e55",
  "unit_id": "fc06e493-e9c6-429b-9529-bc07084818ee",
  "customer_id": "7d2c9a0f-4e55-4a72-8e1b-3b9e6f105c4d",
  "origin_location_id": "11111111-1111-4111-8111-111111111111",
  "destination_location_id": "22222222-2222-4222-8222-222222222222",
  "planned_load_at": "2026-11-12T08:00:00+07:00",
  "estimated_distance_km": 68,
  "travel_allowance_amount": 500000,
  "cargo": { "description": "Palet minuman", "quantity": 120, "unit": "karton" }
}
```
Aturan:
- Driver aktif, unit `active`, lokasi asal dan tujuan ada dan tidak sama.
- `customer_id` boleh kosong (diambil dari customer lokasi tujuan). Bila diisi, harus sama dengan customer lokasi tujuan.
- DO baru berstatus `assigned` dan langsung muncul di aplikasi HP driver.

> **Penting:** server tidak memaksa `unit_id` DO sama dengan unit hasil penugasan, tetapi driver hanya bisa P2H unit hasil penugasan, dan DO hanya bisa diterima bila unit DO sudah P2H layak. **Web admin sebaiknya mengisi `unit_id` otomatis dari penugasan driver pada tanggal `planned_load_at`** (`POST /unit-assignments/get` dengan `{ "date": "...", "driver_id": "..." }`), supaya driver tidak terhenti di langkah terima DO.

Lainnya:
- **Ubah** `PUT /delivery-orders/{id}` (parsial, hanya selama status masih `assigned`).
- **Batalkan** `POST /delivery-orders/{id}/cancel`: `{ "reason": "Customer membatalkan" }` (bisa di status apa pun kecuali `completed`). DO tidak dihapus, hanya dibatalkan.
- **Daftar** `POST /delivery-orders/get`: `{ "status": "assigned", "driver_id": "...", "from": "2026-11-01", "to": "2026-11-30", "search": "0144" }`.
- **Detail** `GET /delivery-orders/{id}` (lengkap dengan linimasa, foto, dan rekap).

---

## 8. Satu hari kerja driver (aplikasi HP)

### Sebelum login

`GET /config/public` (tanpa token): bahasa yang tersedia, `min_app_version` / `latest_app_version` / `update_url` (aplikasi membandingkan sendiri versinya dan meminta update bila terlalu lama), status `maintenance`, dan kontak bantuan.

### Login

Lihat [bagian 2](#login-driver).

### Konfigurasi dan layar awal

```
GET /config           aturan foto, kategori biaya, modul aktif, config_version, kode dan nama perusahaan
GET /app/bootstrap    layar mana yang dibuka
```
Respons `bootstrap`:
```json
{
  "server_time": "2026-11-12T06:20:00+07:00",
  "config_version": 7,
  "driver": { "id": "3b9e6f10-…", "code": "DRV-0021", "name": "Andi Pratama", "phone": "081234567890" },
  "unit_today": { "id": "fc06e493-…", "plate": "B 9123 KZ", "type": "CDD Bak" },
  "p2h_today": { "status": "belum" },
  "assigned_do_count": 1,
  "active_do_id": null,
  "pending_sync": { "count": 0 },
  "next_screen": "P2H"
}
```
`next_screen`:
- `DO_ACTIVE`: ada DO berjalan, buka DO `active_do_id`.
- `P2H`: ada unit hari ini tetapi P2H `belum` atau `tidak_layak` (termasuk bila admin meminta P2H ulang: `recheck_requested: true`).
- `DO_ASSIGNED`: selain itu, tampilkan daftar DO yang ditugaskan (bisa kosong).

Bila `unit_today` `null`, driver belum di-assign unit hari ini. Tampilkan pesan "Hubungi admin untuk penugasan unit" ([bagian 6](#6-penugasan-unit-harian-assign-unit-ke-driver)).

Bila `config_version` berbeda dari yang tersimpan di HP, ambil ulang `GET /config`.

### Upload foto

Semua foto diupload lebih dulu, lalu id-nya dipakai di langkah berikutnya.

`POST /media` (`multipart/form-data`)
```
file         = <foto JPEG/PNG>
kind         = p2h_body
side         = depan                     (wajib hanya untuk kind p2h_body: depan|kanan|kiri|belakang)
client_ref   = 5b1d8a52-3c7e-4e91-9f4a-6d2b8c0e7a13
captured_at  = 2026-11-12T06:30:00+07:00
gps          = {"lat": -6.18, "lng": 106.94, "accuracy_m": 8}
```
`kind`: `odometer_start`, `odometer_end`, `receipt`, `loading`, `delivery_note`, `unloading`, `stamped_delivery_note`, `p2h_body`, `damage`, `location`, `signature`. Respons berisi `id` (media_id). Foto dari galeri ditolak (harus dari kamera). Lihat foto: `GET /media/{id}`.

### P2H unit (Pemeriksaan Harian sebelum jalan)

Syarat: unit di-assign ke driver ini hari ini.

1. `GET /p2h/template`: daftar item checklist aktif dan sisi foto bodi yang wajib.
2. Upload 4 foto bodi (`kind = p2h_body`, `side` sesuai).
3. Kirim `POST /units/{unitId}/p2h` (`unitId` = `unit_today.id`):
```json
{
  "client_ref": "0a6f4c2e-91d3-4b57-8e20-7c1d9f3a5b68",
  "checked_at": "2026-11-12T06:35:00+07:00",
  "gps": { "lat": -6.18, "lng": 106.94, "accuracy_m": 8 },
  "items": [
    { "code": "ban", "result": "sesuai" },
    { "code": "oli", "result": "sesuai" },
    { "code": "lampu", "result": "tidak_sesuai", "description": "Lampu sein kiri mati" },
    { "code": "rem", "result": "sesuai" }
  ],
  "body_photo_ids": {
    "depan": "<media_id>", "kanan": "<media_id>", "kiri": "<media_id>", "belakang": "<media_id>"
  },
  "admin_confirmed_by_driver": true
}
```
- Semua item checklist aktif wajib dijawab; `description` wajib bila `tidak_sesuai`.
- Status dihitung server:
  - `layak`: semua sesuai, unit boleh jalan.
  - `catatan`: ada item tidak sesuai tetapi bukan item kritis, unit **boleh** jalan.
  - `tidak_layak`: ada item kritis tidak sesuai, unit **tidak boleh** jalan (`can_operate: false`). Setelah diperbaiki, admin meminta P2H ulang ([bagian 9](#9-setelah-do-selesai-admin)).
- P2H berlaku untuk unit itu sampai `p2h.valid_until_local` hari itu (bawaan 23:59). Satu P2H per unit per hari berlaku untuk semua driver unit itu.
- Cek hasil: `GET /units/{unitId}/p2h/today`.

### Terima DO

Daftar DO yang ditugaskan: `POST /delivery-orders/get` dengan `{ "status": "assigned" }`. Detail: `GET /delivery-orders/{id}`.

`POST /delivery-orders/{id}/accept`
```json
{
  "client_ref": "c3a9e7d1-5f20-4b84-a6c9-1e8d4f7b2a05",
  "accepted_at": "2026-11-12T07:00:00+07:00",
  "gps": { "lat": -6.18, "lng": 106.94 },
  "travel_allowance_received": true
}
```
Ditolak bila:
- `P2H_REQUIRED`: unit DO belum P2H hari ini, atau P2H-nya `tidak_layak`.
- `INVALID_STATE`: DO bukan berstatus `assigned`, atau driver masih punya DO lain yang berjalan (**satu driver hanya boleh satu DO berjalan**).
- `VALIDATION_ERROR` di `travel_allowance_received`: DO punya uang jalan tetapi driver belum mengonfirmasi menerimanya.

DO berjalan: `GET /delivery-orders/active`. Riwayat: `POST /delivery-orders/history` dengan `{ "from": "2026-11-01", "to": "2026-11-12", "limit": 20, "cursor": "..." }`.

### Muat (status `accepted` → `loading`)

`POST /delivery-orders/{id}/loading`
```json
{
  "client_ref": "8e4b1f60-2d97-4a35-b0c8-5a7e3d9f1c42",
  "loaded_at": "2026-11-12T08:10:00+07:00",
  "gps": { "lat": -6.18, "lng": 106.94 },
  "cargo_photo_ids": ["<media_id>", "<media_id>"],
  "quantity_matches_do": true,
  "delivery_note_pages": [
    { "page": 1, "media_id": "<media_id>" }
  ]
}
```
Jumlah foto mengikuti `photo_rules.loading` dan `photo_rules.delivery_note_pages`. Bila `quantity_matches_do: false`, `quantity_note` wajib: `"quantity_note": "Kurang 5 karton"`.

### Odometer awal (status `loading` → `in_transit`)

`POST /delivery-orders/{id}/odometer`. OCR dilakukan di HP, hasilnya dikirim dari HP.
```json
{
  "client_ref": "d1c7a5e3-6b24-4f09-8a71-2e9c4b6d0f83",
  "type": "start",
  "media_id": "<media_id kind odometer_start>",
  "ocr": { "km": 45210, "fuel_level": "three_quarter" },
  "corrected": null,
  "correction_reason": null,
  "captured_at": "2026-11-12T08:15:00+07:00",
  "gps": { "lat": -6.18, "lng": 106.94 }
}
```
Bila driver mengoreksi hasil OCR: isi `corrected` (`{ "km": 45215, "fuel_level": "half" }`) dan `correction_reason` (wajib bila `correction_reason_required: true`). `fuel_level`: `empty`, `quarter`, `half`, `three_quarter`, `full`.

### Biaya perjalanan (status `in_transit` atau `handover`)

Kategori struk (misalnya BBM, `input: receipt_ocr`): `POST /delivery-orders/{id}/expenses`
```json
{
  "client_ref": "f2b8d4a6-7c13-4e50-9d82-3a5f1c7e9b04",
  "category": "bbm",
  "media_id": "<media_id kind receipt>",
  "ocr": { "time": "09:20", "fuel_type": "Solar", "liters": 40, "price_per_liter": 6800, "total": 272000 },
  "corrected": null,
  "captured_at": "2026-11-12T09:21:00+07:00",
  "gps": { "lat": -6.3, "lng": 107.1 }
}
```
Kategori manual (tol, parkir, dan lainnya):
```json
{
  "client_ref": "a4e6c8b0-1d35-4f72-b9a1-6c2e8d0f3a57",
  "category": "tol",
  "amount": 45000,
  "description": "Tol Cikampek",
  "proof_media_id": null,
  "recorded_at": "2026-11-12T09:40:00+07:00"
}
```
`description` dan `proof_media_id` wajib bila kategorinya mengatur `description_required` / `proof_required`. Struk yang sama (isi atau foto) ditolak `DUPLICATE_RECEIPT`. Daftar biaya sebuah DO: `GET /delivery-orders/{id}/expenses`.

### Serah terima (status `in_transit` → `handover`)

`POST /delivery-orders/{id}/handover`. Bentuk bergantung pada `condition`.

`lengkap`:
```json
{
  "client_ref": "b7d3f1a9-4e68-4c20-8b5d-0a9e2c6f4d81",
  "condition": "lengkap",
  "gps": { "lat": -6.3, "lng": 107.3, "accuracy_m": 10 },
  "recorded_at": "2026-11-12T11:30:00+07:00",
  "unloading_photo_ids": ["<media_id>"],
  "stamped_delivery_note_ids": ["<media_id>"],
  "receiver": {
    "name": "Pak Dedi",
    "signature_media_id": "<media_id>",
    "signed_at": "2026-11-12T11:28:00+07:00"
  },
  "note": "Diterima baik"
}
```
`masalah` (barang rusak atau kurang): tambahkan `issues`, `received_quantity`, dan `receiver.acknowledges_issues` (field lain sama dengan `lengkap`):
```json
{
  "condition": "masalah",
  "received_quantity": 115,
  "issues": [
    { "type": "rusak", "quantity": 5, "unit": "karton", "note": "Penyok", "photo_ids": ["<media_id>"] }
  ],
  "receiver": { "name": "Pak Dedi", "signature_media_id": "<media_id>", "signed_at": "2026-11-12T11:28:00+07:00", "acknowledges_issues": true }
}
```
`issues[].type`: `rusak`, `kurang`, `salah_kirim`, `lainnya`.

`gagal_kirim`: tanpa foto bongkar, surat jalan, dan penerima.
```json
{
  "client_ref": "e9a2c4b6-8d10-4f37-a5c3-7b1d9e0f2a64",
  "condition": "gagal_kirim",
  "gps": { "lat": -6.3, "lng": 107.3 },
  "failure_reason": "penerima_tidak_ada",
  "location_photo_ids": ["<media_id>"],
  "note": "Gudang tutup"
}
```
`failure_reason`: `penerima_tidak_ada`, `alamat_tidak_ditemukan`, `ditolak_penerima`, `lainnya`.

### Odometer akhir (status `handover`)

`POST /delivery-orders/{id}/odometer` dengan `"type": "end"` dan `media_id` foto `kind = odometer_end`. Bentuk sama dengan odometer awal. Angka km akhir tidak boleh lebih kecil dari km awal, dan hanya bisa dicatat sekali.

### Ringkasan dan selesai (status `handover` → `completed`)

```
GET /delivery-orders/{id}/summary
```
`POST /delivery-orders/{id}/complete`
```json
{ "client_ref": "1c5e7a9b-3d42-4a68-b0f1-8e6d2c4a7b93", "completed_at": "2026-11-12T12:00:00+07:00", "gps": { "lat": -6.3, "lng": 107.3 } }
```
Ditolak `INVALID_STATE` (`expected_step: odometer_end`) bila odometer akhir belum dicatat. Setelah selesai, DO dikunci (`DO_LOCKED` untuk perubahan apa pun) dan rekap uang jalan dibuat otomatis.

### Offline

Bila tanpa sinyal, aksi disimpan di HP dan dikirim berurutan lewat satu permintaan `POST /sync/batch`:
```json
{
  "device_id": "android-3f9a1c",
  "items": [
    {
      "client_ref": "f2b8d4a6-7c13-4e50-9d82-3a5f1c7e9b04",
      "method": "POST",
      "path": "/api/v1/delivery-orders/<id>/expenses",
      "body": { "client_ref": "f2b8d4a6-7c13-4e50-9d82-3a5f1c7e9b04", "category": "tol", "amount": 45000, "recorded_at": "2026-11-12T09:40:00+07:00" },
      "client_created_at": "2026-11-12T09:40:00+07:00"
    }
  ]
}
```
Maksimal 100 item per permintaan, `client_ref` tidak boleh kembar. Hasil tiap item dikembalikan terpisah, dan pengiriman ulang tidak membuat data ganda. Foto tetap diupload lewat `POST /media` lebih dulu. Item yang gagal tercatat di server dan terlihat di `pending_sync` (`/app/bootstrap`, `/me`).

---

## 9. Setelah DO selesai (admin)

Pantau dan periksa:
- DO: `POST /delivery-orders/get`, detail `GET /delivery-orders/{id}` (lengkap dengan linimasa, foto, dan rekap).
- P2H: `POST /p2h/get` dengan `{ "unit_id": "...", "status": "tidak_layak", "from": "2026-11-01", "to": "2026-11-12" }`, detail `GET /p2h/{id}`.
- Foto: `POST /media/get` dengan `{ "kind": "receipt", "captured_by": "...", "from": "2026-11-01", "to": "2026-11-12" }`, detail `GET /media/{id}`.
- Biaya: `POST /expenses/get` dengan `{ "delivery_order_id": "...", "category": "tol", "voided": false }`, detail `GET /expenses/{id}`.

Tindakan:
- **Koreksi P2H** `PUT /p2h/{id}` (status dihitung ulang):
  ```json
  { "items": [ { "code": "lampu", "result": "sesuai" } ] }
  ```
- **Minta P2H ulang** `POST /units/{unitId}/p2h/recheck`: `{ "note": "Lampu sein sudah diganti, mohon P2H ulang" }`. Aplikasi driver kembali ke layar P2H.
- **Batalkan biaya** yang tidak sah `POST /expenses/{id}/void`: `{ "reason": "Struk bukan milik perjalanan ini" }` (total DO dan rekap dihitung ulang).
- **Rekap uang jalan** dibuat otomatis saat DO selesai. Daftar: `POST /settlements/get` dengan `{ "type": "refund_to_company", "settled": false, "driver_id": "...", "from": "...", "to": "..." }`, detail `GET /settlements/{id}`. Tandai sudah disetor atau dibayar `POST /settlements/{id}/settle`:
  ```json
  { "note": "Setor tunai ke kasir", "settled_at": "2026-11-13T10:00:00+07:00" }
  ```
  `type`: `refund_to_company` (driver menyetor sisa), `payable_to_driver` (perusahaan membayar kekurangan), `balanced` (pas).
- **Hapus lunak** (hanya admin dengan hak `delete`): `DELETE /p2h/{id}`, `DELETE /media/{id}` (ditolak bila masih dipakai), `DELETE /p2h-items/{code}`, `DELETE /expense-categories/{code}`.
- DO tidak dihapus tetapi dibatalkan (`POST /delivery-orders/{id}/cancel`).

---

## 10. Status DO dan langkah yang diizinkan

```
assigned ──accept──> accepted ──loading──> loading ──odometer start──> in_transit ──handover──> handover ──odometer end + complete──> completed
    │                   │                     │                           │                        │
    └───────────────────┴─────────────────────┴───── cancel (admin) ──────┴────────────────────────┴──> cancelled
```

| Status | Arti | Langkah driver yang diizinkan | Langkah admin |
|---|---|---|---|
| `assigned` | DO dibuat, menunggu driver | `accept` | ubah, batalkan |
| `accepted` | Diterima, menuju lokasi muat | `loading` | batalkan |
| `loading` | Barang sudah dimuat | `odometer` (`start`) | batalkan |
| `in_transit` | Dalam perjalanan | `expenses`, `handover` | batalkan |
| `handover` | Sudah serah terima | `expenses`, `odometer` (`end`), `summary`, `complete` | batalkan |
| `completed` | Selesai dan dikunci | - (`DO_LOCKED`) | lihat, `void` biaya, `settle` rekap |
| `cancelled` | Dibatalkan admin | - (`DO_CANCELLED`) | lihat |

Langkah di luar urutan ditolak `409 INVALID_STATE` dengan `details.status` (status sekarang) dan `details.expected` (status yang dibutuhkan).

`delivery_status` (hasil serah terima): mengikuti `condition` handover (`lengkap`, `masalah`, `gagal_kirim`).

---

## 11. Daftar kode error

| Kode | HTTP | Kapan terjadi | Yang sebaiknya dilakukan FE |
|---|---|---|---|
| `VALIDATION_ERROR` | 422 | Field salah atau kurang | Tampilkan `details[].message` di field `details[].field` |
| `BAD_REQUEST` | 400 | Format request salah (JSON rusak, dll.) | Perbaiki request |
| `UNAUTHORIZED` | 401 | Tidak ada token, token tidak valid, refresh gagal | Arahkan ke login |
| `TOKEN_EXPIRED` | 401 | Access token habis | `POST /auth/refresh` lalu ulangi request |
| `INVALID_CREDENTIALS` | 401 | Username atau password salah | Tampilkan pesan dan `details.remaining_attempts` |
| `INVALID_CLIENT_CODE` | 401 | `client_code` tidak dikenal | Minta pengguna cek kode perusahaan |
| `ACCOUNT_LOCKED` | 423 | Terlalu banyak salah password | Tampilkan `details.locked_until`; driver bisa minta admin `unlock` |
| `CLIENT_INACTIVE` | 403 | Perusahaan dinonaktifkan | Tampilkan pesan, hubungi admin |
| `FORBIDDEN` | 403 | Tidak punya hak (`details.required`), akun nonaktif, role nonaktif, atau bukan unit milik driver | Sembunyikan fitur / tampilkan pesan |
| `NOT_FOUND` | 404 | Data tidak ada (atau milik driver lain) | Muat ulang daftar |
| `ROUTE_NOT_FOUND` | 404 | URL endpoint salah | Periksa path |
| `CONFLICT` | 409 | Bentrok dengan data lain: masih dipakai, `sudah_bekerja`, admin terakhir, `client_ref` untuk DO lain | Tampilkan `message` |
| `INVALID_STATE` | 409 | Langkah tidak sesuai status DO, atau masih ada DO berjalan | Muat ulang DO, arahkan ke langkah yang benar |
| `P2H_REQUIRED` | 409 | Terima DO sebelum unit P2H layak | Arahkan ke layar P2H |
| `DUPLICATE_RECEIPT` | 409 | Struk sudah pernah dipakai | Tampilkan pesan |
| `DO_LOCKED` | 409 | DO sudah selesai | Muat ulang, DO hanya bisa dilihat |
| `DO_CANCELLED` | 409 | DO dibatalkan admin | Keluarkan driver dari layar DO itu |
| `PAYLOAD_TOO_LARGE` | 413 | File melebihi `UPLOAD_MAX_SIZE` | Kompres foto |
| `UNSUPPORTED_MEDIA_TYPE` | 415 | Bukan JPEG/PNG | Pakai format yang benar |
| `RATE_LIMITED` | 429 | Terlalu banyak request | Tunggu lalu coba lagi |
| `TENANT_UNAVAILABLE` | 503 | Database perusahaan tidak bisa dihubungi | Coba lagi nanti |
| `INTERNAL_ERROR` | 500 | Kesalahan server | Coba lagi, laporkan bila berulang |

Kode `APP_UPDATE_REQUIRED` (426) dan `MAINTENANCE` (503) sudah terdaftar tetapi **saat ini belum dikirim server**. Untuk versi aplikasi dan pemeliharaan, aplikasi HP membaca `GET /config/public` (`min_app_version`, `update_url`, `maintenance.active`) dan memutuskan sendiri.

---

## 12. Daftar lengkap endpoint dan hak yang dibutuhkan

Semua path di bawah `/api/v1`. "Hak" untuk admin = `<modul>:<aksi>` dari role admin; untuk driver = `<modul driver>:<aksi>` dari role driver.

### Umum dan auth

| Method | Path | Siapa | Hak |
|---|---|---|---|
| GET | `/config/public` | publik | - |
| POST | `/auth/login` | publik | - |
| POST | `/auth/refresh` | publik | - |
| POST | `/auth/logout` | admin, driver | - |

### Aplikasi driver

| Method | Path | Hak driver |
|---|---|---|
| GET | `/config` | `driver_profile:read` |
| GET | `/app/bootstrap` | `driver_profile:read` |
| GET | `/me` | `driver_profile:read` |
| PUT | `/me/settings` | `driver_profile:update` |
| POST | `/me/password` | `driver_profile:update` |
| POST | `/devices/push-token` | `driver_device:create` |
| POST | `/media` | `driver_media:create` |
| GET | `/media/{id}` | `driver_media:read` (admin: `media:read`) |
| GET | `/p2h/template` | `driver_p2h:read` |
| GET | `/units/{unitId}/p2h/today` | `driver_p2h:read` |
| POST | `/units/{unitId}/p2h` | `driver_p2h:create` |
| POST | `/delivery-orders/get` | `driver_delivery_orders:read` (admin: `delivery_orders:read`) |
| GET | `/delivery-orders/active` | `driver_delivery_orders:read` |
| POST | `/delivery-orders/history` | `driver_delivery_orders:read` |
| GET | `/delivery-orders/{id}` | `driver_delivery_orders:read` (admin: `delivery_orders:read`) |
| POST | `/delivery-orders/{id}/accept` | `driver_delivery_orders:update` |
| POST | `/delivery-orders/{id}/loading` | `driver_trip:create` |
| POST | `/delivery-orders/{id}/odometer` | `driver_trip:create` |
| GET | `/delivery-orders/{id}/expenses` | `driver_expenses:read` |
| POST | `/delivery-orders/{id}/expenses` | `driver_expenses:create` |
| POST | `/delivery-orders/{id}/handover` | `driver_trip:create` |
| GET | `/delivery-orders/{id}/summary` | `driver_delivery_orders:read` |
| POST | `/delivery-orders/{id}/complete` | `driver_delivery_orders:update` |
| POST | `/sync/batch` | `driver_sync:create` |

### Web admin

| Modul hak | Endpoint |
|---|---|
| `users` | `POST /users/get` (read), `GET /users/{id}` (read), `POST /users` (create), `PUT /users/{id}` (update), `POST /users/{id}/reset-password` (update), `DELETE /users/{id}` (delete) |
| `roles` | `GET /roles/catalog` (read), `POST /roles/get` (read), `GET /roles/{id}` (read), `POST /roles` (create), `PUT /roles/{id}` (update), `DELETE /roles/{id}` (delete) |
| `drivers` | `POST /drivers/get` (read), `GET /drivers/{id}` (read), `POST /drivers` (create), `PUT /drivers/{id}` (update), `POST /drivers/{id}/reset-password` (update), `POST /drivers/{id}/unlock` (update), `DELETE /drivers/{id}` (delete) |
| `unit_types` | `POST /unit-types/get`, `GET /unit-types/{id}`, `POST /unit-types`, `PUT /unit-types/{id}`, `DELETE /unit-types/{id}` |
| `units` | `POST /units/get`, `GET /units/{id}`, `POST /units`, `PUT /units/{id}`, `DELETE /units/{id}` |
| `customers` | `POST /customers/get`, `GET /customers/{id}`, `POST /customers`, `PUT /customers/{id}`, `DELETE /customers/{id}` |
| `locations` | `POST /locations/get`, `GET /locations/{id}`, `POST /locations`, `PUT /locations/{id}`, `DELETE /locations/{id}` |
| `unit_assignments` | `POST /unit-assignments/get` (read), `GET /unit-assignments/{id}` (read), `POST /unit-assignments` (create), `PUT /unit-assignments` (update), `DELETE /unit-assignments/{id}` (delete) |
| `delivery_orders` | `POST /delivery-orders/get` (read), `GET /delivery-orders/{id}` (read), `POST /delivery-orders` (create), `PUT /delivery-orders/{id}` (update), `POST /delivery-orders/{id}/cancel` (update) |
| `p2h` | `POST /p2h/get` (read), `GET /p2h/{id}` (read), `PUT /p2h/{id}` (update), `POST /units/{unitId}/p2h/recheck` (update), `DELETE /p2h/{id}` (delete) |
| `media` | `POST /media/get` (read), `GET /media/{id}` (read), `DELETE /media/{id}` (delete) |
| `expenses` | `POST /expenses/get` (read), `GET /expenses/{id}` (read), `POST /expenses/{id}/void` (update) |
| `settlements` | `POST /settlements/get` (read), `GET /settlements/{id}` (read), `POST /settlements/{id}/settle` (update) |
| `p2h_items` | `POST /p2h-items/get`, `GET /p2h-items/{code}`, `POST /p2h-items`, `PUT /p2h-items/{code}`, `DELETE /p2h-items/{code}` |
| `expense_categories` | `POST /expense-categories/get`, `GET /expense-categories/{code}`, `POST /expense-categories`, `PUT /expense-categories/{code}`, `DELETE /expense-categories/{code}` |
| `settings` | `GET /settings` (read), `PUT /settings` (update) |

Untuk modul tanpa keterangan aksi, berlaku aturan umum: `get`/`GET` = read, `POST /` = create, `PUT` = update, `DELETE` = delete.

### Internal (saas-api, header `X-Internal-Key`)

`POST /internal/tenants/{client_id}/migrate`, `POST /internal/tenants/{client_id}/seed`, `GET /internal/tenants/{client_id}/verify`, `POST /internal/tenants/{client_id}/system-user/reset`, `GET /internal/migrations/status`.

---

## 13. Penyimpanan foto

Semua foto (dan thumbnail) disimpan di Nextcloud lewat WebDAV di `NEXTCLOUD_UPLOAD_DIR/media/<CLIENT>/<tahun>/<bulan>/<tanggal>/`. API menyajikannya di `/storage/...`, jadi aplikasi memakai URL API dan kredensial Nextcloud hanya ada di server. Tidak ada penyimpanan lokal. Batas ukuran file: `UPLOAD_MAX_SIZE` (byte, bawaan 10 MB). Tipe file: JPEG dan PNG.

## 14. Konfigurasi penting (`.env`)

| Kebutuhan | Variabel |
|---|---|
| Mode client | `TENANT_REGISTRY=env` (dev, satu client dari `.env`) atau `remote` (saas-api) |
| Hubungan ke saas-api | `SAAS_API_INTERNAL_URL`, `INTERNAL_API_KEY`, `INTERNAL_PROVISIONING_KEY`, `TENANT_DB_ENC_KEY` (harus sama dengan saas-api) |
| Hubungan dari saas-api ke service ini | di `.env` saas-api: `LOGISTICS_API_INTERNAL_URL=http://<host>:9060/internal` |
| Penyimpanan foto | `STORAGE_DRIVER=nextcloud`, `NEXTCLOUD_URL`, `NEXTCLOUD_USERNAME`, `NEXTCLOUD_PASSWORD`, `NEXTCLOUD_UPLOAD_DIR`, `UPLOAD_MAX_SIZE` |
| Token dan login | `JWT_ACCESS_TTL` (bawaan 86400 detik), `JWT_REFRESH_TTL` (2592000), `JWT_REFRESH_TTL_SHORT` (86400), `AUTH_MAX_LOGIN_ATTEMPTS` (5), `AUTH_LOCK_MINUTES` (15) |
| Batas request | `RATE_LIMIT_PER_MINUTE` (300), `RATE_LIMIT_AUTH_PER_15MIN` (20) |

Nodemon tidak memantau `.env`: setelah mengubahnya, restart proses (`rs`) agar nilainya terbaca.

## 15. Belum ada

- `DELETE` untuk delivery order, biaya, dan rekap uang jalan (tetap `cancel`, `void`, `settle`).
- Notifikasi push (FCM) untuk driver (token sudah disimpan lewat `/devices/push-token`, pengirimannya belum).
- Pengecekan otomatis: `unit_id` DO sama dengan unit hasil penugasan driver ([bagian 7](#7-membuat-delivery-order-admin)).
- Invalidasi cache tenant lewat Redis (penangguhan perusahaan baru terasa setelah cache habis, sampai `TENANT_RESOLVE_TTL`, 5 menit).
