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
const { addBodyExamples } = require('./auto-examples')

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

/**
 * Urutan endpoint di Swagger: kelompokkan per resource (urutan kemunculan pertama), lalu di dalamnya
 * daftar (/x/get), buat (/x), detail (/x/{id}), tindakan lain (/x/{id}/...). Tanpa ini, endpoint daftar hasil konversi POST
 * jatuh di akhir dokumen dan terlihat "loncat".
 */
const pathRank = (path) => {
  const rest = path.split('/').filter(Boolean).slice(1)
  if (rest.length === 0) return 1
  if (['get', 'history', 'catalog'].includes(rest[0])) return 0
  if (rest.length === 1 && rest[0].startsWith('{')) return 2
  return 3
}

const orderPaths = (all) => {
  const groupOrder = []
  Object.keys(all).forEach((p) => {
    const group = p.split('/').filter(Boolean)[0]
    if (!groupOrder.includes(group)) groupOrder.push(group)
  })
  const keys = Object.keys(all).map((p, index) => ({ p, index }))
  keys.sort((a, b) => {
    const ga = groupOrder.indexOf(a.p.split('/').filter(Boolean)[0])
    const gb = groupOrder.indexOf(b.p.split('/').filter(Boolean)[0])
    return (ga - gb) || (pathRank(a.p) - pathRank(b.p)) || (a.index - b.index)
  })
  return Object.fromEntries(keys.map(({ p }) => [p, all[p]]))
}

const paths = orderPaths(addAssignmentPost(convertListEndpoints(mergePaths(
  require('./paths/app-auth'),
  require('./paths/media-p2h'),
  require('./paths/delivery-orders'),
  require('./paths/orders'),
  require('./paths/operations'),
  require('./paths/config'),
  require('./paths/accounts'),
  require('./paths/master-data'),
  require('./paths/progress'),
  require('./paths/admin-crud'),
  require('./paths/roles'),
  require('./paths/internal')
))))

const description = [
  'API backend aplikasi OGO Driver (Android): P2H unit, delivery order, foto muat/bongkar, odometer, biaya perjalanan, serah terima, dan sync offline.',
  '',
  'Catatan hak akses: endpoint pengelolaan (admin) hanya bisa dipakai akun admin yang rolenya punya hak modul dan aksi terkait; jika tidak, 403 dengan details.required = modul:aksi. Lihat tag Pengguna (role dan permissions).',
].join('\n')

// Contoh request otomatis untuk semua body JSON yang belum punya contoh
addBodyExamples(paths, components.schemas)

// POST /delivery-orders/get dipakai driver dan admin dengan filter berbeda: beri contoh per peran
const doList = paths['/delivery-orders/get'] && paths['/delivery-orders/get'].post
if (doList) {
  doList.requestBody.content['application/json'].examples = {
    'Driver: DO yang ditugaskan': { summary: 'Aplikasi driver: hanya field status yang diterima, hasil otomatis hanya DO milik driver itu', value: { status: 'assigned' } },
    'Driver: semua DO yang masih berjalan': { summary: 'Aplikasi driver: tanpa filter', value: {} },
    'Admin: semua DO': { summary: 'Admin: tanpa filter', value: {} },
    'Admin: dengan filter': {
      summary: 'Admin: semua filter bersifat opsional, pilih yang perlu (id diambil dari /drivers/get, /units/get, /customers/get)',
      value: {
        status: 'assigned', page: 1, limit: 20, search: '0144', sort: '-created_at', from: '2026-11-01', to: '2026-11-30',
      },
    },
  }
  doList.description = [
    doList.description,
    '',
    'Driver: filter selain `status` ditolak (422); hak `driver_delivery_orders:read`. Admin: hak `delivery_orders:read`; `driver_id`, `unit_id`, dan `customer_id` diambil dari `data[].id` di `POST /drivers/get`, `POST /units/get`, dan `POST /customers/get`.',
  ].filter((x) => x !== undefined).join('\n')
}

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
