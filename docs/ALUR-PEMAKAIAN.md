# Alur Pemakaian OGO Logistik

Gambaran dari perusahaan baru sampai pemakaian harian. Detail tiap endpoint ada di Swagger (`/documentation`).

```
HP driver / Web admin ──> API logistik (service ini) ──> saas-api   (minta kredensial database client)
                                   │
                                   ├──> Database client (PostgreSQL, satu database per perusahaan)
                                   └──> Nextcloud            (semua foto)
```

## 1. Perusahaan baru (MSI, lewat saas-api)

1. Admin MSI membuat client di saas-api (`POST /clients`) dan mendapat `client_code`.
2. Worker saas-api membuat database dan dua role Postgres (owner untuk DDL, app untuk DML), lalu memanggil API ini di `/internal` (header `X-Internal-Key` = `INTERNAL_PROVISIONING_KEY`):
   - `POST /internal/tenants/{client_id}/migrate`: membuat semua tabel (idempoten).
   - `POST /internal/tenants/{client_id}/seed`: membuat akun sistem `msi.support`.
   - `GET  /internal/tenants/{client_id}/verify`: memeriksa login role app, tabel, migrasi, dan akun sistem.
3. Orang MSI mengambil password `msi.support` (saas-api: `POST /clients/{id}/reveal-system-user`, hanya superadmin), lalu login ke API ini dengan `client_code` + `msi.support`.
4. Dengan akun itu mereka membuat role (`POST /roles`) dan admin pertama perusahaan (`POST /users` dengan `role_id`). Selanjutnya perusahaan mengelola sendiri.

Catatan:
- `msi.support` selalu berperan **Administrator** (semua hak), tidak tampil di `GET /users`, dan tidak bisa mengganti passwordnya sendiri (password hanya berubah lewat saas-api: `reset-system-user`).
- Rollout migrasi ke semua client dilakukan dari saas-api (`POST /migrations/rollout`), bukan dari service ini.

## 2. Role dan hak akses admin

- Setiap user admin punya satu role. Role berisi hak `read`, `create`, `update`, `delete` per modul (katalog: `GET /roles/catalog`).
- Role bawaan **Administrator** memegang semua hak, tidak bisa diubah atau dihapus.
- Endpoint admin memeriksa hak dan membalas 403 dengan `details.required = "<modul>:<aksi>"` bila tidak punya.
- Admin hanya bisa memberi hak yang dimilikinya sendiri, dan tidak bisa mengelola akun yang haknya di atasnya.
- Perubahan hak berlaku seketika tanpa login ulang. `GET /me` dan respons login memuat `role` dan `permissions` untuk FE.

## 3. Menyiapkan data kerja (admin perusahaan)

| Yang disiapkan | Endpoint |
|---|---|
| Tipe unit, unit, customer, lokasi | `/unit-types`, `/units`, `/customers`, `/locations` |
| Akun driver | `/drivers` |
| Checklist P2H, kategori biaya, pengaturan aplikasi | `/p2h-items`, `/expense-categories`, `/settings` |
| Penugasan unit harian (driver, unit, tanggal) | `PUT /unit-assignments` |
| Delivery order dan penugasannya ke driver | `POST /delivery-orders` |

Aturan lokasi: `warehouse` dan `depot` **tidak boleh** punya `customer_id`; `customer_site` **wajib** punya `customer_id`.

Setiap perubahan konfigurasi menaikkan `config_version`, sehingga aplikasi HP mengambil ulang `GET /config`.

Daftar memakai `POST /<modul>/get` dengan filter di body (standar api-hrm). Detail tetap `GET /<modul>/{id}`.

## 4. Satu hari kerja driver (aplikasi HP)

1. **Login**: `POST /auth/login` (No. HP atau ID driver, password, `client_code`, data perangkat).
2. **Konfigurasi dan keadaan awal**: `GET /config`, lalu `GET /app/bootstrap` (menentukan layar: P2H, DO, atau DO berjalan).
3. **P2H unit**: foto badan unit diupload (`POST /media`, masuk Nextcloud), lalu `POST /units/{unitId}/p2h`. Tanpa P2H, DO tidak bisa diterima (`P2H_REQUIRED`).
4. **Terima DO**: `POST /delivery-orders/{id}/accept`.
5. **Muat dan odometer**: `POST /delivery-orders/{id}/loading` dan `/odometer` (OCR dilakukan di HP, hasilnya dikirim dari HP).
6. **Biaya perjalanan**: `POST /delivery-orders/{id}/expenses` (BBM, tol, parkir, dan lainnya) dengan foto struk.
7. **Serah terima dan selesai**: `/handover`, `GET /summary`, `/complete`.
8. **Offline**: bila tanpa sinyal, antrean dikirim lewat `POST /sync/batch`. Pengiriman ulang aman karena setiap permintaan membawa `client_ref` (UUID dari HP).

## 5. Setelah DO selesai (admin)

- Memantau DO (`POST /delivery-orders/get`), P2H (`POST /p2h/get`, koreksi dengan `PUT /p2h/{id}`), dan foto (`POST /media/get`).
- Minta P2H ulang untuk sebuah unit: `POST /units/{unitId}/p2h/recheck`.
- Membatalkan biaya yang tidak sah: `POST /expenses/{id}/void` (total DO dan rekap dihitung ulang).
- Rekap uang jalan dibuat otomatis saat DO selesai. Admin menandainya sudah disetor atau dibayar: `POST /settlements/{id}/settle`.
- DO tidak dihapus tetapi dibatalkan (`POST /delivery-orders/{id}/cancel`).

## 6. Penyimpanan foto

Semua foto (dan thumbnail) disimpan di Nextcloud lewat WebDAV di `NEXTCLOUD_UPLOAD_DIR/media/<CLIENT>/<tahun>/<bulan>/<tanggal>/`. API menyajikannya di `/storage/...`, jadi aplikasi memakai URL API dan kredensial Nextcloud hanya ada di server. Tidak ada penyimpanan lokal.

## 7. Konfigurasi penting (`.env`)

| Kebutuhan | Variabel |
|---|---|
| Mode client | `TENANT_REGISTRY=env` (dev, satu client dari `.env`) atau `remote` (saas-api) |
| Hubungan ke saas-api | `SAAS_API_INTERNAL_URL`, `INTERNAL_API_KEY`, `INTERNAL_PROVISIONING_KEY`, `TENANT_DB_ENC_KEY` (harus sama dengan saas-api) |
| Hubungan dari saas-api ke service ini | di `.env` saas-api: `LOGISTICS_API_INTERNAL_URL=http://<host>:9060/internal` |
| Penyimpanan foto | `STORAGE_DRIVER=nextcloud`, `NEXTCLOUD_URL`, `NEXTCLOUD_USERNAME`, `NEXTCLOUD_PASSWORD`, `NEXTCLOUD_UPLOAD_DIR` |

Nodemon tidak memantau `.env`: setelah mengubahnya, restart proses (`rs`) agar nilainya terbaca.

## 8. Belum ada

- Notifikasi push (FCM) untuk driver.
- Invalidasi cache tenant lewat Redis (penangguhan perusahaan baru terasa setelah cache habis, sampai `TENANT_RESOLVE_TTL`, 5 menit).
