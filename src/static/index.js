/**
 * Dokumen OpenAPI 3.0 untuk OGO Service API (aplikasi OGO Driver).
 * Disajikan di /documentation (UI) dan /documentation.json (raw).
 *
 * Struktur:
 *   components.js   -> schema objek, response error, parameter
 *   paths/*.js      -> endpoint per kelompok
 *   examples/**     -> fixture JSON kontrak (request/response/error/push)
 */
const pkg = require('../../package.json')
const components = require('./components')

const paths = {
  ...require('./paths/app-auth'),
  ...require('./paths/media-p2h'),
  ...require('./paths/delivery-orders'),
}

const description = `
API backend ekspedisi pengiriman barang untuk aplikasi **OGO Driver** (Android).

### Format response
- Sukses: \`{ "success": true, "data": ..., "meta": ... }\` (\`meta\` hanya untuk list).
- Gagal: \`{ "success": false, "error": { "code", "message", "http_status", "details" } }\`.
  Aplikasi mengambil keputusan dari \`error.code\`, bukan dari teks \`message\`.
- Bahasa \`message\` mengikuti header \`Accept-Language\` (\`id\` default, \`en\`, \`zh\`).

### Konvensi
- Waktu: ISO 8601 dengan offset, contoh \`2026-11-05T13:50:00+07:00\`.
- Uang: bilangan bulat Rupiah (IDR).
- Setiap request yang membuat data membawa \`client_ref\` (UUID dari HP) untuk idempotensi & sync offline.
- Foto diupload dulu ke \`POST /media\`, lalu id-nya dipakai di endpoint lain.

### Alur aplikasi
Splash → (\`/config/public\`) → Login → \`/app/bootstrap\` → P2H → DO ditugaskan → Terima → Muat → Odometer awal
→ Perjalanan (biaya) → Serah terima → Odometer akhir → Ringkasan → Selesai.

### Kode error
| Code | HTTP | Kapan |
|---|---|---|
| VALIDATION_ERROR | 422 | Field tidak valid, \`details\` = [{field, message}] |
| UNAUTHORIZED | 401 | Token tidak ada / tidak valid → Login |
| TOKEN_EXPIRED | 401 | Access token habis → \`POST /auth/refresh\` |
| INVALID_CREDENTIALS | 401 | Login gagal, \`details.remaining_attempts\` |
| ACCOUNT_LOCKED | 423 | Terlalu banyak login gagal |
| FORBIDDEN | 403 | Data bukan milik driver |
| NOT_FOUND / ROUTE_NOT_FOUND | 404 | Data / endpoint tidak ada |
| P2H_REQUIRED | 409 | Terima DO sebelum P2H |
| INVALID_STATE | 409 | Langkah tidak sesuai urutan status DO |
| DUPLICATE_RECEIPT | 409 | Struk sudah dipakai di DO lain |
| DO_LOCKED | 409 | DO sudah selesai |
| PAYLOAD_TOO_LARGE / UNSUPPORTED_MEDIA_TYPE | 413 / 415 | Upload foto |
| APP_UPDATE_REQUIRED | 426 | Versi aplikasi di bawah minimum |
| RATE_LIMITED | 429 | Terlalu banyak request |
| MAINTENANCE | 503 | Mode pemeliharaan |

### Push notification (FCM data message)
Bukan endpoint; bentuk payload ada di schema \`PushDoAssigned\` dan \`PushP2hRecheckRequested\`.
`

const index = {
  openapi: '3.0.3',
  info: {
    title: 'OGO Service API',
    version: pkg.version,
    description,
  },
  servers: [
    { url: '/api/v1', description: 'Server ini' },
    { url: 'http://localhost:9060/api/v1', description: 'Lokal' },
  ],
  tags: [
    { name: 'App', description: 'Splash, konfigurasi, bootstrap' },
    { name: 'Auth', description: 'Login, refresh token, logout' },
    { name: 'Akun', description: 'Profil, pengaturan, perangkat' },
    { name: 'Media', description: 'Upload foto dari kamera' },
    { name: 'OCR', description: 'Baca odometer & struk' },
    { name: 'P2H', description: 'Pemeriksaan harian unit' },
    { name: 'Delivery Order', description: 'DO ditugaskan, berjalan, riwayat, terima DO' },
    { name: 'Perjalanan', description: 'Muat, odometer, biaya, serah terima, ringkasan, selesai' },
    { name: 'Sync', description: 'Antrean offline' },
  ],
  paths,
  components: {
    securitySchemes: components.securitySchemes,
    schemas: components.schemas,
    responses: components.responses,
    parameters: components.parameters,
  },
}

module.exports = { index }
