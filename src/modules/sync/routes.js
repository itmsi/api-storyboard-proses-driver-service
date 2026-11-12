/**
 * Daftar endpoint yang boleh dikirim lewat sync batch, beserta cara memprosesnya.
 * Tiap entri memakai skema Joi dan service yang SAMA dengan endpoint aslinya, jadi aturan bisnis tidak ganda.
 * Endpoint yang tidak ada di sini (mis. upload foto `POST /media`, yang multipart) tidak bisa dikirim lewat batch.
 */
const p2hSchema = require('../p2h/validation')
const p2hService = require('../p2h/service')
const doSchema = require('../delivery-orders/validation')
const doService = require('../delivery-orders/service')
const loadingSchema = require('../loading/validation')
const loadingService = require('../loading/service')
const odometerSchema = require('../odometer/validation')
const odometerService = require('../odometer/service')
const expensesSchema = require('../expenses/validation')
const expensesService = require('../expenses/service')
const handoverSchema = require('../handover/validation')
const handoverService = require('../handover/service')
const summarySchema = require('../summary/validation')
const summaryService = require('../summary/service')
const meSchema = require('../me/validation')
const meService = require('../me/service')

const money = (n) => Number(n).toLocaleString('id-ID')
const titleCase = (s) => `${s.charAt(0).toUpperCase()}${s.slice(1)}`

/** Teks singkat item untuk layar Berjalan, mis. "Tol 54.500". */
const expenseLabel = (body) => {
  const amount = body.amount ?? (body.corrected && body.corrected.total) ?? (body.ocr && body.ocr.total)
  return `${titleCase(String(body.category))}${amount ? ` ${money(amount)}` : ''}`
}

// Services mengembalikan bentuk berbeda; adapter menyeragamkan menjadi { id, created }
const fromResult = ({ result, created }) => ({ id: result.id, created })

const doStep = (step, paramSchema, bodySchema, type, run, label) => ({
  method: 'POST',
  pattern: new RegExp(`^/delivery-orders/([^/]+)/${step}$`),
  params: ['id'],
  paramSchema,
  bodySchema,
  type,
  run,
  doScoped: true,
  label: label || (() => type),
})

const routes = [
  {
    method: 'POST',
    pattern: /^\/units\/([^/]+)\/p2h$/,
    params: ['unitId'],
    paramSchema: p2hSchema.unitParams,
    bodySchema: p2hSchema.submit,
    type: 'p2h',
    label: () => 'P2H',
    run: async (db, auth, p, body) => {
      const { inspection, created } = await p2hService.submit(db, auth, p.unitId, body)
      return { id: inspection.id, created }
    },
  },
  doStep('accept', doSchema.idParams, doSchema.accept, 'accept', async (db, auth, p, body) => fromResult(await doService.accept(db, auth, p.id, body))),
  doStep('loading', loadingSchema.idParams, loadingSchema.loading, 'loading', async (db, auth, p, body) => (
    fromResult(await loadingService.create(db, auth, p.id, body))
  ), () => 'Foto muatan'),
  doStep('odometer', odometerSchema.idParams, odometerSchema.odometer, 'odometer', async (db, auth, p, body) => (
    fromResult(await odometerService.create(db, auth, p.id, body))
  ), (body) => (body.type === 'end' ? 'Odometer akhir' : 'Odometer awal')),
  doStep('expenses', expensesSchema.idParams, expensesSchema.create, 'expense', async (db, auth, p, body) => (
    fromResult(await expensesService.create(db, auth, p.id, body))
  ), expenseLabel),
  doStep('handover', handoverSchema.idParams, handoverSchema.handover, 'handover', async (db, auth, p, body) => (
    fromResult(await handoverService.create(db, auth, p.id, body))
  ), () => 'Serah terima'),
  doStep('complete', summarySchema.idParams, summarySchema.complete, 'complete', async (db, auth, p, body) => (
    fromResult(await summaryService.complete(db, auth, p.id, body))
  ), () => 'Selesaikan DO'),
  {
    method: 'PUT',
    pattern: /^\/me\/settings$/,
    params: [],
    bodySchema: meSchema.settings,
    type: 'settings',
    label: () => 'Pengaturan',
    // pengaturan bersifat menimpa nilai (idempoten alami), selalu dianggap diproses
    run: async (db, auth, p, body) => {
      await meService.updateSettings(db, auth, body)
      return { id: null, created: true }
    },
  },
]

/**
 * Hak driver yang dibutuhkan tiap jenis item (modul:aksi), sama dengan hak endpoint aslinya. Sync batch hanya jalan bila
 * driver punya hak sync (driver_sync:create) DAN hak untuk tiap item; item tanpa hak gagal sendiri (403), item lain tetap diproses.
 */
const REQUIRED = {
  p2h: ['driver_p2h', 'create'],
  accept: ['driver_delivery_orders', 'update'],
  complete: ['driver_delivery_orders', 'update'],
  loading: ['driver_trip', 'create'],
  odometer: ['driver_trip', 'create'],
  handover: ['driver_trip', 'create'],
  expense: ['driver_expenses', 'create'],
  settings: ['driver_profile', 'update'],
}

/** Normalisasi path dari HP ("/api/v1/..." dan query string diabaikan), cari rute yang cocok. */
const match = (method, rawPath) => {
  const path = String(rawPath).split('?')[0].replace(/^\/api\/v1(?=\/)/, '').replace(/\/+$/, '')
  // eslint-disable-next-line no-restricted-syntax
  for (const route of routes) {
    if (route.method !== method) continue // eslint-disable-line no-continue
    const found = route.pattern.exec(path)
    if (found) return { route, params: Object.fromEntries(route.params.map((name, i) => [name, found[i + 1]])) }
  }
  return null
}

module.exports = { match, REQUIRED }
