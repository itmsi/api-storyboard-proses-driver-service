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

## Menjalankan tanpa Docker

Butuh Node.js 20+ dan PostgreSQL.

```bash
cp .env.example .env        # isi DB_* dan JWT_SECRET
npm install
npm run migrate
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
| Endpoint lain (auth, P2H, DO, perjalanan, sync) | Menunggu skema DB final |
