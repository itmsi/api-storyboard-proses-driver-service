# Alur Pemakaian OGO Logistik

Gambaran dari perusahaan baru sampai pemakaian harian, lengkap dengan contoh request di tiap langkah. Detail tiap endpoint ada di Swagger (`/documentation`).

```
HP driver / Web admin ──> API logistik (service ini) ──> saas-api   (minta kredensial database client)
                                   │
                                   ├──> Database client (PostgreSQL, satu database per perusahaan)
                                   └──> Nextcloud            (semua foto)
```

Aturan umum untuk semua contoh:
- Base URL `/api/v1`. Endpoint yang butuh login memakai header `Authorization: Bearer <access_token>`.
- Respons sukses: `{ "success": true, "data": ..., "meta": ... }`. Error: `{ "success": false, "error": { "code", "message", "details" } }`.
- Semua `id` di contoh adalah UUID. Ganti dengan id sebenarnya dari respons endpoint sebelumnya.
- Waktu memakai ISO 8601 (contoh `2026-11-12T08:30:00+07:00`), tanggal `YYYY-MM-DD`. Waktu dari HP tidak boleh lebih dari 5 menit di masa depan.
- `client_ref` = UUID v4 yang dibuat HP untuk satu aksi. Mengirim ulang aksi yang sama (jaringan putus) aman karena server mengenali `client_ref` yang sama.
- Daftar memakai `POST /<modul>/get` dengan filter di body (semua field opsional, body boleh `{}`):
  ```json
  { "page": 1, "limit": 20, "search": "budi", "sort": "-created_at" }
  ```

---

## 1. Perusahaan baru (MSI, lewat saas-api)

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

3. Orang MSI mengambil password `msi.support` (saas-api: `POST /clients/{id}/reveal-system-user`, hanya superadmin), lalu login ke API ini (lihat bagian 4, login admin).
4. Dengan akun itu mereka membuat role dan admin pertama perusahaan (bagian 2 dan 3).

Catatan:
- `msi.support` selalu berperan **Administrator** (semua hak), tidak tampil di `GET /users`, dan tidak bisa mengganti passwordnya sendiri (password hanya berubah lewat saas-api: `reset-system-user`).
- Rollout migrasi ke semua client dilakukan dari saas-api (`POST /migrations/rollout`), bukan dari service ini.

## 2. Role dan hak akses admin

- Setiap user admin punya satu role. Role berisi hak `read`, `create`, `update`, `delete` per modul.
- Role bawaan **Administrator** memegang semua hak, tidak bisa diubah atau dihapus.
- Endpoint admin memeriksa hak dan membalas 403 dengan `details.required = "<modul>:<aksi>"` bila tidak punya.
- Admin hanya bisa memberi hak yang dimilikinya sendiri, dan tidak bisa mengelola akun yang haknya di atasnya.
- Perubahan hak berlaku seketika tanpa login ulang.

Semua akun (admin dan driver) login dari tabel `users` dan **punya `role_id`** yang menunjuk ke tabel `roles`. Setiap role punya `user_type` (`admin` atau `driver`) yang menentukan jenis akun, aplikasi, dan modul hak yang boleh dimilikinya. Role bawaan: **Administrator** (admin, semua hak, terkunci) dan **Driver** (driver, default permission driver; hak dan deskripsinya boleh disesuaikan, tidak bisa dihapus). Seeder `default-roles` menyiapkan keduanya di setiap client dan tidak menimpa perubahan admin.

**Modul hak driver** (default role Driver memegang semuanya):

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

Role driver wajib memuat `driver_profile:read` (tanpa itu aplikasi HP tidak bisa dibuka). Endpoint driver membalas 403 dengan `details.required = "<modul>:<aksi>"` bila role-nya tidak punya hak. Perubahan role berlaku seketika.

Modul: `drivers`, `users`, `roles`, `unit_types`, `units`, `customers`, `locations`, `unit_assignments`, `delivery_orders`, `expenses`, `settlements`, `p2h`, `media`, `p2h_items`, `expense_categories`, `settings`. `update` mencakup tindakan seperti batalkan DO/biaya, tandai lunas, reset password, dan minta P2H ulang.

**Katalog modul dan aksi** (untuk menggambar matriks hak di layar):
```
GET /roles/catalog
```

**Buat role** `POST /roles` (`user_type` bawaan `admin`; isi `driver` untuk role aplikasi HP, contoh: `{ "name": "Driver Magang", "user_type": "driver", "permissions": { "driver_profile": ["read"], "driver_p2h": ["read", "create"] } }`):
```json
{
  "name": "Staf Operasional",
  "code": "operasional",
  "description": "Mengelola unit dan customer",
  "permissions": {
    "units": ["read", "create", "update"],
    "customers": ["read", "create", "update"],
    "delivery_orders": ["read"]
  },
  "is_active": true
}
```
`code` boleh dikosongkan (dibuat dari nama). Modul atau aksi yang tidak dikenal ditolak 422.

**Ubah role** `PUT /roles/{id}` (kirim hanya yang berubah):
```json
{ "permissions": { "units": ["read"], "drivers": ["read"] }, "is_active": true }
```

**Daftar role** `POST /roles/get`: `{ "search": "staf", "is_active": true }`. **Hapus** `DELETE /roles/{id}` (ditolak 409 bila masih dipakai akun).

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
`password` kosong = dibuatkan password sementara (dikembalikan sekali di respons `initial_password`). `role_id` kosong = role Administrator (hanya boleh oleh admin dengan hak setara).

**Ubah admin** `PUT /users/{id}`: `{ "name": "Dewi A.", "status": "suspended", "role_id": "<id role lain>" }`.
**Reset password** `POST /users/{id}/reset-password`: `{ "password": "PasswordBaru1" }` (kosong = dibuatkan sementara).

## 3. Menyiapkan data kerja (admin perusahaan)

### Tipe unit, unit, customer, lokasi

`POST /unit-types`
```json
{ "code": "CDD_BAK", "name": "CDD Bak", "max_load_kg": 2500 }
```

`POST /units`
```json
{
  "plate": "B 9123 KZ",
  "unit_type_id": "3b9e6f10-5c4d-4a72-8e1b-7d2c9a0f4e55",
  "brand": "Mitsubishi",
  "year": 2022,
  "status": "active",
  "stnk_expires_on": "2027-05-01",
  "kir_expires_on": "2027-02-15"
}
```
`status`: `active`, `maintenance`, `inactive`. Filter daftar: `{ "status": "active", "unit_type_id": "..." }`.

`POST /customers`
```json
{ "code": "CUST-001", "name": "PT Contoh Jaya", "phone": "021-5550100", "email": "ops@contohjaya.co.id" }
```

`POST /locations`. Aturan: `warehouse` dan `depot` **tidak boleh** punya `customer_id`; `customer_site` **wajib** punya `customer_id`.
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
Filter daftar: `{ "type": "customer_site", "customer_id": "..." }`. Kode tipe unit dan customer tidak bisa diubah setelah dibuat.

### Akun driver

`POST /drivers`
```json
{
  "name": "Andi Pratama",
  "phone": "081234567890",
  "code": "DRV-0021",
  "license_no": "1234-5678-9012",
  "license_type": "B2 Umum",
  "license_expires_on": "2028-03-01",
  "password": "PasswordAwal1"
}
```
`code` kosong = otomatis `DRV-0001`, `DRV-0002`, ... `password` kosong = password sementara (`initial_password` di respons). Tambahkan `"role_id": "<id role driver>"` untuk role driver tertentu; kosong = role bawaan Driver. Role admin ditolak.

Lainnya: `PUT /drivers/{id}` (`{ "status": "suspended" }`), `POST /drivers/{id}/reset-password` (`{ "password": "..." }`), `POST /drivers/{id}/unlock`, `DELETE /drivers/{id}`.

### Konfigurasi

`POST /p2h-items` (item checklist P2H)
```json
{ "code": "klakson", "label": "Klakson", "hint": "Berbunyi normal", "is_critical": false, "sort_order": 5, "is_active": true }
```
`is_critical: true` = item tidak sesuai membuat status P2H `tidak_layak`.

`POST /expense-categories`
```json
{ "code": "tol", "label": "Tol", "input": "manual", "description_required": true, "proof_required": false, "sort_order": 2 }
```
`input`: `receipt_ocr` (struk dibaca OCR di HP, mis. BBM) atau `manual` (isi nominal).

`PUT /settings` (kirim hanya kelompok yang berubah)
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

### Penugasan unit harian dan delivery order

`PUT /unit-assignments` (atau `POST`, sama: satu driver satu unit per tanggal, menimpa yang ada)
```json
{ "driver_id": "3b9e6f10-5c4d-4a72-8e1b-7d2c9a0f4e55", "unit_id": "fc06e493-e9c6-429b-9529-bc07084818ee", "work_date": "2026-11-12" }
```
Daftar: `POST /unit-assignments/get` dengan `{ "date": "2026-11-12", "driver_id": "...", "unit_id": "..." }` (tanpa `date` = hari ini).

`POST /delivery-orders` (buat dan tugaskan DO)
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
Lainnya: `PUT /delivery-orders/{id}` (parsial, hanya selama belum diterima driver), `POST /delivery-orders/{id}/cancel` (`{ "reason": "Customer membatalkan" }`). Daftar: `POST /delivery-orders/get` dengan `{ "status": "assigned", "driver_id": "...", "from": "2026-11-01", "to": "2026-11-30", "search": "0144" }`.

## 4. Satu hari kerja driver (aplikasi HP)

### Login

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
`username` driver = ID driver atau No. HP. Driver **wajib** mengirim `device`. Respons berisi `access_token`, `refresh_token`, dan `driver` (termasuk `role` dan `permissions` agar aplikasi bisa menyembunyikan fitur yang tidak diizinkan; server tetap memeriksa).

**Login admin** memakai bentuk yang sama tanpa `device`; `username` boleh username atau email. Respons berisi `admin` dengan `role` dan `permissions`.
```json
{ "client_code": "OGO", "username": "dewi.admin", "password": "PasswordAwal1" }
```
Refresh: `POST /auth/refresh` `{ "refresh_token": "..." }`. Keluar: `POST /auth/logout`.

### Konfigurasi dan keadaan awal

```
GET /config           (aturan foto, kategori biaya, modul aktif, config_version)
GET /app/bootstrap    (layar mana yang dibuka: P2H, DO ditugaskan, atau DO berjalan)
```

### Upload foto

`POST /media` (`multipart/form-data`, field: `file`, `kind`, `client_ref`, `captured_at`, `gps`, `side`)
```
file         = <foto JPEG/PNG>
kind         = p2h_body
side         = depan                     (wajib hanya untuk kind p2h_body: depan|kanan|kiri|belakang)
client_ref   = 5b1d8a52-3c7e-4e91-9f4a-6d2b8c0e7a13
captured_at  = 2026-11-12T06:30:00+07:00
gps          = {"lat": -6.18, "lng": 106.94, "accuracy_m": 8}
```
`kind`: `odometer_start`, `odometer_end`, `receipt`, `loading`, `delivery_note`, `unloading`, `stamped_delivery_note`, `p2h_body`, `damage`, `location`, `signature`. Respons berisi `id` yang dipakai di langkah berikutnya. Foto dari galeri ditolak.

### P2H unit

`POST /units/{unitId}/p2h`
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
Semua item checklist aktif wajib dijawab; `description` wajib bila `tidak_sesuai`; sisi foto mengikuti `photo_rules.p2h_body.required_sides`. Status dihitung server: `layak`, `catatan`, atau `tidak_layak` (item kritis tidak sesuai). Cek hasil: `GET /units/{unitId}/p2h/today`.

### Terima DO

`POST /delivery-orders/{id}/accept`
```json
{
  "client_ref": "c3a9e7d1-5f20-4b84-a6c9-1e8d4f7b2a05",
  "accepted_at": "2026-11-12T07:00:00+07:00",
  "gps": { "lat": -6.18, "lng": 106.94 },
  "travel_allowance_received": true
}
```
Ditolak `P2H_REQUIRED` bila unit belum P2H hari ini. Daftar DO driver: `POST /delivery-orders/get` dengan `{ "status": "assigned" }`; yang berjalan `GET /delivery-orders/active`; riwayat `POST /delivery-orders/history` dengan `{ "from": "2026-11-01", "to": "2026-11-12", "limit": 20, "cursor": "..." }`.

### Muat

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
Bila `quantity_matches_do: false`, `quantity_note` wajib: `"quantity_note": "Kurang 5 karton"`.

### Odometer

`POST /delivery-orders/{id}/odometer` (awal `start`, akhir `end`). OCR dilakukan di HP, hasilnya dikirim dari HP.
```json
{
  "client_ref": "d1c7a5e3-6b24-4f09-8a71-2e9c4b6d0f83",
  "type": "start",
  "media_id": "<media_id>",
  "ocr": { "km": 45210, "fuel_level": "three_quarter" },
  "corrected": null,
  "correction_reason": null,
  "captured_at": "2026-11-12T08:15:00+07:00",
  "gps": { "lat": -6.18, "lng": 106.94 }
}
```
Bila driver mengoreksi hasil OCR: isi `corrected` (`{ "km": 45215, "fuel_level": "half" }`) dan `correction_reason`. `fuel_level`: `empty`, `quarter`, `half`, `three_quarter`, `full`.

### Biaya perjalanan

Kategori struk (mis. BBM, `input: receipt_ocr`): `POST /delivery-orders/{id}/expenses`
```json
{
  "client_ref": "f2b8d4a6-7c13-4e50-9d82-3a5f1c7e9b04",
  "category": "bbm",
  "media_id": "<media_id>",
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
Struk yang sama (isi atau foto) ditolak `DUPLICATE_RECEIPT`. Daftar biaya sebuah DO: `GET /delivery-orders/{id}/expenses`.

### Serah terima

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
`masalah` (barang rusak atau kurang): tambahkan `issues` dan `received_quantity`, dan `receiver.acknowledges_issues`:
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
(field lain sama dengan `lengkap`). `issues[].type`: `rusak`, `kurang`, `salah_kirim`, `lainnya`.

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

### Ringkasan dan selesai

```
GET /delivery-orders/{id}/summary
```
`POST /delivery-orders/{id}/complete`
```json
{ "client_ref": "1c5e7a9b-3d42-4a68-b0f1-8e6d2c4a7b93", "completed_at": "2026-11-12T12:00:00+07:00", "gps": { "lat": -6.3, "lng": 107.3 } }
```

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
Maksimal 100 item per permintaan, `client_ref` tidak boleh kembar. Hasil tiap item dikembalikan terpisah, dan pengiriman ulang tidak membuat data ganda. Foto tetap diupload lewat `POST /media` lebih dulu.

## 5. Setelah DO selesai (admin)

Pantau dan periksa:
- DO: `POST /delivery-orders/get`, detail `GET /delivery-orders/{id}` (lengkap dengan linimasa, foto, dan rekap).
- P2H: `POST /p2h/get` dengan `{ "unit_id": "...", "status": "tidak_layak", "from": "2026-11-01", "to": "2026-11-12" }`, detail `GET /p2h/{id}`.
- Foto: `POST /media/get` dengan `{ "kind": "receipt", "captured_by": "...", "from": "2026-11-01", "to": "2026-11-12" }`, detail `GET /media/{id}`.

Tindakan:
- Koreksi P2H `PUT /p2h/{id}` (status dihitung ulang):
  ```json
  { "items": [ { "code": "lampu", "result": "sesuai" } ] }
  ```
- Minta P2H ulang `POST /units/{unitId}/p2h/recheck`: `{ "note": "Lampu sein sudah diganti, mohon P2H ulang" }`.
- Batalkan biaya yang tidak sah `POST /expenses/{id}/void`: `{ "reason": "Struk bukan milik perjalanan ini" }` (total DO dan rekap dihitung ulang). Daftar biaya: `POST /expenses/get` dengan `{ "delivery_order_id": "...", "category": "tol", "voided": false }`.
- Rekap uang jalan dibuat otomatis saat DO selesai. Daftar: `POST /settlements/get` dengan `{ "type": "refund_to_company", "settled": false, "driver_id": "...", "from": "...", "to": "..." }`. Tandai sudah disetor atau dibayar `POST /settlements/{id}/settle`:
  ```json
  { "note": "Setor tunai ke kasir", "settled_at": "2026-11-13T10:00:00+07:00" }
  ```
  `type`: `refund_to_company` (driver menyetor sisa), `payable_to_driver` (perusahaan membayar kekurangan), `balanced`.
- Hapus lunak (hanya admin dengan hak `delete`): `DELETE /p2h/{id}`, `DELETE /media/{id}` (ditolak bila masih dipakai), `DELETE /p2h-items/{code}`, `DELETE /expense-categories/{code}`.
- DO tidak dihapus tetapi dibatalkan (`POST /delivery-orders/{id}/cancel`).

## 6. Penyimpanan foto

Semua foto (dan thumbnail) disimpan di Nextcloud lewat WebDAV di `NEXTCLOUD_UPLOAD_DIR/media/<CLIENT>/<tahun>/<bulan>/<tanggal>/`. API menyajikannya di `/storage/...`, jadi aplikasi memakai URL API dan kredensial Nextcloud hanya ada di server. Tidak ada penyimpanan lokal. Batas ukuran file: `UPLOAD_MAX_SIZE` (byte).

## 7. Konfigurasi penting (`.env`)

| Kebutuhan | Variabel |
|---|---|
| Mode client | `TENANT_REGISTRY=env` (dev, satu client dari `.env`) atau `remote` (saas-api) |
| Hubungan ke saas-api | `SAAS_API_INTERNAL_URL`, `INTERNAL_API_KEY`, `INTERNAL_PROVISIONING_KEY`, `TENANT_DB_ENC_KEY` (harus sama dengan saas-api) |
| Hubungan dari saas-api ke service ini | di `.env` saas-api: `LOGISTICS_API_INTERNAL_URL=http://<host>:9060/internal` |
| Penyimpanan foto | `STORAGE_DRIVER=nextcloud`, `NEXTCLOUD_URL`, `NEXTCLOUD_USERNAME`, `NEXTCLOUD_PASSWORD`, `NEXTCLOUD_UPLOAD_DIR`, `UPLOAD_MAX_SIZE` |

Nodemon tidak memantau `.env`: setelah mengubahnya, restart proses (`rs`) agar nilainya terbaca.

## 8. Belum ada

- `DELETE` untuk delivery order, biaya, dan rekap uang jalan (tetap `cancel`, `void`, `settle`).
- Notifikasi push (FCM) untuk driver.
- Invalidasi cache tenant lewat Redis (penangguhan perusahaan baru terasa setelah cache habis, sampai `TENANT_RESOLVE_TTL`, 5 menit).
