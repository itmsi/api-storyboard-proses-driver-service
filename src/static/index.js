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
  ...require('./paths/internal'),
}

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
    { name: 'Internal', description: 'Antar-layanan (project manage company): migrasi database client. Header X-Internal-Key.' },
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
