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

/**
 * Standar API: daftar dengan filter memakai POST + body (bukan query string).
 * Dokumen endpoint ditulis sebagai GET dengan parameter query (mudah dibaca); di sini dipindah menjadi
 * POST <path>/get dengan body JSON berisi parameter itu. Detail by id tetap GET.
 */
const LIST_PATHS = [
  '/drivers', '/users', '/unit-types', '/units', '/customers', '/locations', '/p2h-items', '/expense-categories',
  '/expenses', '/settlements', '/unit-assignments', '/delivery-orders',
]
const HISTORY_PATH = '/delivery-orders/history' // riwayat driver: POST /delivery-orders/history

const queryToBody = (operation) => {
  const query = (operation.parameters || []).filter((p) => p.in === 'query')
  const rest = (operation.parameters || []).filter((p) => p.in !== 'query')
  const properties = {}
  query.forEach((p) => {
    properties[p.name] = { ...p.schema, ...(p.description ? { description: p.description } : {}) }
  })
  const converted = { ...operation, requestBody: { required: false, content: { 'application/json': { schema: { type: 'object', properties } } } } }
  if (rest.length) converted.parameters = rest
  else delete converted.parameters
  return converted
}

const convertListEndpoints = (all) => {
  const result = { ...all }
  LIST_PATHS.forEach((path) => {
    if (!result[path] || !result[path].get) return
    const { get, ...others } = result[path]
    result[path] = others
    result[`${path}/get`] = { post: queryToBody(get) }
  })
  if (result[HISTORY_PATH] && result[HISTORY_PATH].get) {
    const { get, ...others } = result[HISTORY_PATH]
    result[HISTORY_PATH] = { ...others, post: queryToBody(get) }
  }
  return result
}

// POST /unit-assignments sama dengan PUT (upsert)
const addAssignmentPost = (all) => {
  const item = all['/unit-assignments']
  if (item && item.put && !item.post) item.post = { ...item.put, summary: `${item.put.summary} (POST sama dengan PUT)` }
  return all
}

const paths = addAssignmentPost(convertListEndpoints(mergePaths(
  require('./paths/app-auth'),
  require('./paths/media-p2h'),
  require('./paths/delivery-orders'),
  require('./paths/orders'),
  require('./paths/operations'),
  require('./paths/config'),
  require('./paths/accounts'),
  require('./paths/master-data'),
  require('./paths/admin-crud'),
  require('./paths/roles'),
  require('./paths/internal')
)))

const description = [
  'API backend aplikasi OGO Driver (Android): P2H unit, delivery order, foto muat/bongkar, odometer, biaya perjalanan, serah terima, dan sync offline.',
  '',
  'Catatan hak akses: endpoint pengelolaan (admin) hanya bisa dipakai akun admin yang rolenya punya hak modul dan aksi terkait; jika tidak, 403 dengan details.required = modul:aksi. Lihat tag Pengguna (role dan permissions).',
].join('\n')

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
    { name: 'Media', description: 'Upload foto dari kamera (driver); daftar, detail, dan hapus lunak (admin)' },
    { name: 'P2H', description: 'Pemeriksaan harian unit (driver); daftar, detail, koreksi, hapus lunak, dan minta ulang (admin)' },
    { name: 'Delivery Order', description: 'DO milik driver (ditugaskan, berjalan, riwayat, terima) dan pengelolaan DO oleh admin (daftar, detail, buat, ubah, batalkan). Isi daftar dan detail mengikuti akun yang login.' },
    { name: 'Perjalanan', description: 'Muat, odometer, biaya, serah terima, ringkasan, selesai (driver); biaya perjalanan dan rekap uang jalan (admin)' },
    { name: 'Sync', description: 'Antrean offline' },
    { name: 'Pengguna', description: 'Akun driver, akun admin, role, dan hak akses CRUD per modul' },
    { name: 'Master Data', description: 'Tipe unit, unit, customer, lokasi, dan penugasan unit harian' },
    { name: 'Konfigurasi', description: 'Checklist P2H, kategori biaya, dan pengaturan aplikasi per perusahaan; setiap perubahan menaikkan config_version' },
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
