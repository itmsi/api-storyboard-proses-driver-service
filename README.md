# OGO Service API

Backend ekspedisi pengiriman barang untuk aplikasi Android **OGO Driver**: P2H unit, delivery order, foto muat/bongkar, odometer, biaya perjalanan, serah terima, dan sync offline.

- Port default: **9060**
- Dokumentasi API (Swagger): `http://localhost:9060/documentation`
- Base URL API: `http://localhost:9060/api/v1`

## Stack

Node.js 20+ · Express 4 · PostgreSQL 13+ (Knex) · JWT · Joi · Multer · MinIO/S3 (opsional) · Swagger UI

## Struktur

```
src/
├── server.js              # start server + graceful shutdown
├── app.js                 # middleware global (helmet, cors, compression, morgan)
├── config/index.js        # SEMUA konfigurasi dibaca dari .env di sini
├── database/
│   ├── index.js           # instance knex
│   ├── knexfile.js
│   ├── migrations/
│   ├── seeds/
│   └── schema.draft.sql   # usulan skema DB (belum dimigrasi)
├── lang/index.js          # pesan error id / en / zh
├── middlewares/
│   ├── auth.js            # authenticate (JWT), authorize(role)
│   ├── validate.js        # validasi Joi -> 422 VALIDATION_ERROR
│   ├── upload.js          # upload foto (multer, memory)
│   ├── rate-limit.js
│   └── error-handler.js   # 404 + format error standar
├── modules/
│   └── app/               # contoh modul: GET /config/public
├── routes/
│   ├── index.js           # /, /health, /documentation
│   └── v1.js              # semua route /api/v1
├── static/                # Swagger / OpenAPI
│   ├── index.js
│   ├── components.js      # schema & response error
│   ├── paths/*.js         # endpoint per kelompok
│   └── examples/**        # fixture JSON kontrak (request/response/error/push)
└── utils/
    ├── errors.js          # AppError + daftar kode error
    ├── response.js        # ok(), created(), asyncHandler()
    ├── storage.js         # simpan foto: local / s3
    └── logger.js
```

## Multi-tenant (database per client)

Satu API melayani banyak perusahaan; tiap perusahaan punya database sendiri. Kredensial database dikelola project
"manage company" dan dipilih lewat **client code** saat login.

- Login membawa `client_code` → `src/database/tenant` mengambil kredensial (`TenantRegistry`) → koneksi dibuat & di-cache.
- Client code ikut di JWT; `authenticate` mengisi `req.db` (knex milik client), repository selalu memakai `req.db`.
- Sementara (`TENANT_REGISTRY=env`): satu tenant dev memakai `DB_*` di `.env`, kode `TENANT_DEV_CODE` (default `OGO`),
  atau beberapa tenant lewat `TENANTS_JSON`. Adapter project manage company menyusul di `src/database/tenant/registry.js`.
- Migrasi per tenant: `npm run migrate:tenant -- --client=OGO` atau `-- --all`; rollback `npm run migrate:tenant:rollback -- --client=OGO`;
  seed dev `npm run seed:tenant -- --client=OGO` (driver DRV-0021 / password `Passw0rd!`, jangan di production).
- Endpoint internal untuk project manage company (header `X-Internal-Key` = `INTERNAL_API_KEY`; kosong = nonaktif):
  `POST /api/v1/internal/tenants/{clientCode}/migrate` (idempoten, sinkron, boleh untuk client yang belum aktif) dan
  `GET /api/v1/internal/tenants/{clientCode}/migration-status`. Dokumentasi di Swagger, tag **Internal**.
- Test: `npm test` (tanpa DB). Test end-to-end DB: `RUN_DB_TESTS=1 npm test`. Test **menghapus isi database** (rollback semua migrasi), jadi selalu diarahkan ke database terpisah `ogo_driver_test` (ubah lewat `TEST_DB_NAME`, nama wajib berakhiran `_test`), apa pun isi `DB_NAME` di `.env`. Database dev (`DB_NAME`) tidak tersentuh.

## Menjalankan tanpa Docker

Butuh Node.js 20+ dan PostgreSQL.

```bash
cp .env.example .env        # isi DB_* dan JWT_SECRET
npm install
npm run migrate:tenant -- --client=OGO
npm run dev                 # auto-reload (nodemon)
# atau
npm start
```

Untuk server produksi tanpa Docker, jalankan dengan process manager, contoh PM2:

```bash
NODE_ENV=production pm2 start src/server.js --name api-ogo-service
```

## Menjalankan dengan Docker

`docker-compose.yml` memakai network eksternal `infra_net` (dipakai bersama nginx / cloudflare tunnel). Buat sekali jika belum ada:

```bash
docker network create infra_net
```

**Postgres di host** (set `DB_HOST=host.docker.internal` di `.env`):

```bash
docker compose up -d --build
docker compose exec api npx knex --knexfile src/database/knexfile.js migrate:latest
```

**Postgres ikut di Docker** (set `DB_HOST=ogo-db`, `DB_PORT=5432` di `.env`):

```bash
docker compose --profile local-db up -d --build
```

Port dibuka di `127.0.0.1:9060`. Ganti menjadi `"9060:9060"` di `docker-compose.yml` jika perlu diakses dari jaringan lain.

Log: `docker compose logs -f api`

## Environment

Lihat `.env.example` untuk daftar lengkap. Yang penting:

| Variabel | Keterangan |
|---|---|
| `APP_PORT` | Default `9060` |
| `NODE_ENV` | `development` / `production` |
| `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` | Koneksi PostgreSQL |
| `JWT_SECRET` | **Wajib** di production (server menolak start tanpa ini) |
| `SWAGGER_ENABLED` | Default aktif di development, mati di production |
| `STORAGE_DRIVER` | `local` (folder `storage/`) atau `s3` (MinIO/S3) |
| `MOBILE_MIN_APP_VERSION`, `MAINTENANCE_MODE`, `SUPPORT_PHONE` | Isi `GET /config/public` |

## Format response

Sukses:

```json
{ "success": true, "data": { }, "meta": { } }
```

Gagal:

```json
{
  "success": false,
  "error": {
    "code": "P2H_REQUIRED",
    "message": "Unit belum di-P2H hari ini. DO baru bisa diterima setelah P2H.",
    "http_status": 409,
    "details": { "unit_id": "unit_9123" }
  }
}
```

- Aplikasi memutuskan aksi dari `error.code`; `message` siap ditampilkan dan mengikuti header `Accept-Language` (`id`, `en`, `zh`).
- Daftar kode error ada di `src/utils/errors.js` dan di halaman Swagger.
- Waktu memakai ISO 8601 dengan offset (`2026-11-05T13:50:00+07:00`), uang dalam Rupiah bilangan bulat.

## Membuat modul baru

Satu fitur = satu folder di `src/modules/<nama>/`:

| File | Isi |
|---|---|
| `index.js` | router: path + middleware (`authenticate`, `validate`) |
| `validation.js` | skema Joi |
| `controller.js` | baca request, panggil service, kirim `ok()` / `created()` |
| `service.js` | aturan bisnis, lempar `new AppError('KODE', { details })` |
| `repository.js` | query knex (`require('../../database')`) |

Contoh:

```js
// src/modules/delivery-orders/index.js
const router = require('express').Router()
const { authenticate, authorize } = require('../../middlewares/auth')
const { validate } = require('../../middlewares/validate')
const { asyncHandler } = require('../../utils/response')
const schema = require('./validation')
const controller = require('./controller')

router.use(authenticate, authorize('driver'))
router.post('/:id/accept', validate({ body: schema.accept }), asyncHandler(controller.accept))

module.exports = router
```

Lalu daftarkan di `src/routes/v1.js` dan tambahkan dokumentasinya di `src/static/paths/`.

## Database

```bash
npm run migrate:make create_users   # buat file migrasi baru
npm run migrate                     # jalankan migrasi
npm run migrate:rollback
npm run seed
```

Usulan skema lengkap ada di `src/database/schema.draft.sql`. Setelah disepakati, pecah menjadi file migrasi knex.

## Status

| Bagian | Status |
|---|---|
| Kerangka server, config, error handling, auth JWT, validasi, upload, storage | Siap |
| Swagger seluruh kontrak OGO Driver (28 endpoint) | Siap |
| `GET /config/public` | Berjalan |
| Fase 1: `POST /auth/login` (client code), `/auth/refresh`, `/auth/logout`, `GET /me`, `PATCH /me/settings`, `POST /devices/push-token`, `GET /config` | Siap (menunggu uji dengan DB) |
| Fase 2: `POST /media` (foto + thumbnail), `GET /p2h/template`, `GET /units/{unitId}/p2h/today`, `POST /units/{unitId}/p2h` | Siap (teruji dengan DB) |
| Fase 3: `GET /app/bootstrap`, `GET /delivery-orders` (+ `/active`, `/history`, `/{id}`), `POST /delivery-orders/{id}/accept` | Siap (teruji dengan DB) |
| Fase 4: `POST /delivery-orders/{id}/loading`, `/odometer`, `GET|POST /delivery-orders/{id}/expenses` | Siap (teruji dengan DB). OCR dilakukan di aplikasi HP; server menyimpan hasil `ocr`, koreksi, dan nilai efektif |
| Fase 5: `POST /delivery-orders/{id}/handover`, `GET /delivery-orders/{id}/summary`, `POST /delivery-orders/{id}/complete` | Siap (teruji dengan DB) |
| Fase 6: `POST /sync/batch` (+ `pending_sync` di bootstrap, layar Berjalan, `GET /me`, logout) | Siap (teruji dengan DB) |
