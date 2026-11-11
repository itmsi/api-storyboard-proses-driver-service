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

// Beberapa path dipakai driver dan admin (mis. /delivery-orders). Digabung per metode HTTP supaya tiap file cukup
// mendeskripsikan operasinya sendiri.
const mergePaths = (...groups) => groups.reduce((all, group) => Object.entries(group).reduce(
  (merged, [path, operations]) => ({ ...merged, [path]: { ...(merged[path] || {}), ...operations } }),
  all
), {})

const paths = mergePaths(
  require('./paths/app-auth'),
  require('./paths/media-p2h'),
  require('./paths/delivery-orders'),
  require('./paths/orders'),
  require('./paths/operations'),
  require('./paths/config'),
  require('./paths/accounts'),
  require('./paths/master-data'),
  require('./paths/internal')
)

const description = 'API backend aplikasi OGO Driver (Android): P2H unit, delivery order, foto muat/bongkar, odometer, biaya perjalanan, serah terima, dan sync offline.'

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
    { name: 'P2H', description: 'Pemeriksaan harian unit' },
    { name: 'Delivery Order', description: 'DO ditugaskan, berjalan, riwayat, terima DO' },
    { name: 'Perjalanan', description: 'Muat, odometer, biaya, serah terima, ringkasan, selesai' },
    { name: 'Sync', description: 'Antrean offline' },
    { name: 'Admin - Pengguna', description: 'Kelola akun admin perusahaan (hanya admin)' },
    { name: 'Admin - Delivery Order', description: 'Buat, ubah, dan batalkan DO oleh admin (daftar dan detail memakai endpoint DO yang sama, isinya mengikuti peran)' },
    { name: 'Admin - Penugasan Unit', description: 'Penugasan unit harian per driver (hanya admin)' },
    { name: 'Admin - P2H', description: 'Minta P2H ulang (hanya admin)' },
    { name: 'Admin - Biaya', description: 'Lihat bukti biaya dan batalkan biaya yang tidak sah (hanya admin)' },
    { name: 'Admin - Rekap Uang Jalan', description: 'Rekap selisih uang jalan per DO dan penandaan sudah disetor/dibayar (hanya admin)' },
    { name: 'Admin - Konfigurasi', description: 'Checklist P2H, kategori biaya, dan pengaturan aplikasi per perusahaan (hanya admin); setiap perubahan menaikkan config_version' },
    { name: 'Admin - Master Data', description: 'Tipe unit, unit, customer, lokasi (hanya admin)' },
    { name: 'Admin - Driver', description: 'Kelola akun driver (hanya admin): buat, ubah, nonaktifkan, reset password, buka kunci' },
    { name: 'Internal', description: 'Antar-layanan (saas-worker), di root /internal (bukan /api/v1): migrasi, seed, verifikasi database client. Header X-Internal-Key.' },
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
