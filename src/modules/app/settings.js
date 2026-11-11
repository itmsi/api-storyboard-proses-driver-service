const { wibDate } = require('../../utils/date')
const repo = require('./repository')

// Default aturan aplikasi (sesuai kontrak). Bisa ditimpa per client lewat tabel app_settings (key = nama field).
const DEFAULT_CONFIG = {
  config_version: '1',
  languages: ['id', 'en', 'zh'],
  default_language: 'id',
  modules: {
    route_tracking: false,
    receipt_ocr: true,
    odometer_ocr: true,
    travel_allowance: true,
    incident_report: false,
  },
  photo_rules: {
    loading: { min: 2, max: 10 },
    unloading: { min: 1, max: 10 },
    delivery_note_pages: { min: 1, max: 5 },
    p2h_body: { required_sides: ['depan', 'kanan', 'kiri', 'belakang'] },
  },
  // Cadangan jika tabel expense_categories kosong; sumber utama = tabel (diubah admin per client)
  expense_categories: [
    { code: 'bbm', label: 'BBM', input: 'receipt_ocr' },
    { code: 'tol', label: 'Tol', input: 'manual' },
    { code: 'parkir', label: 'Parkir', input: 'manual' },
    {
      code: 'lainnya', label: 'Lainnya', input: 'manual', description_required: true,
    },
  ],
  correction_reason_required: true,
  p2h: { frequency: 'daily_per_unit', valid_until_local: '23:59' },
}

/**
 * Default + override per client: tabel app_settings (key = nama field) dan kategori biaya dari tabel expense_categories.
 * Dipakai juga modul lain (aturan foto P2H & muatan, alasan koreksi wajib).
 */
const resolveSettings = async (db) => {
  const [rows, categories] = await Promise.all([repo.getSettings(db), repo.getExpenseCategories(db)])
  const overrides = Object.fromEntries(rows.filter((r) => r.key in DEFAULT_CONFIG).map((r) => [r.key, r.value]))
  return {
    ...DEFAULT_CONFIG,
    ...(categories.length ? {
      expense_categories: categories.map((c) => ({
        code: c.code,
        label: c.label,
        input: c.input,
        ...(c.description_required ? { description_required: true } : {}),
        ...(c.proof_required ? { proof_required: true } : {}),
      })),
    } : {}),
    ...overrides,
  }
}

/**
 * Naikkan config_version (format "YYYY-MM-DD.n", n naik tiap perubahan pada hari yang sama).
 * Dipanggil di transaksi yang sama dengan setiap perubahan konfigurasi, supaya aplikasi driver yang membandingkan
 * versi di bootstrap tahu harus mengambil ulang GET /config.
 */
const bumpConfigVersion = async (trx, adminId) => {
  const current = await repo.findSetting(trx, 'config_version')
  const today = wibDate()
  let counter = 1
  if (current && typeof current.value === 'string') {
    const [day, n] = current.value.split('.')
    if (day === today && Number(n) > 0) counter = Number(n) + 1
  }
  const version = `${today}.${counter}`
  await repo.upsertSetting(trx, 'config_version', version, adminId)
  return version
}

module.exports = { DEFAULT_CONFIG, resolveSettings, bumpConfigVersion }
