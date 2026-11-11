const { AppError } = require('./errors')

/**
 * Hak akses admin per modul. Tiap role berisi { <modul>: [aksi, ...] }.
 * Aksi: read (daftar dan detail), create, update (termasuk tindakan seperti batalkan, tandai lunas, reset password), delete.
 * Role bawaan Administrator (is_system) otomatis memegang semua hak.
 */
const ACTIONS = ['read', 'create', 'update', 'delete']

const RESOURCES = {
  drivers: 'Driver',
  users: 'Pengguna admin',
  roles: 'Role dan hak akses',
  unit_types: 'Tipe unit',
  units: 'Unit',
  customers: 'Customer',
  locations: 'Lokasi',
  unit_assignments: 'Penugasan unit',
  delivery_orders: 'Delivery order',
  expenses: 'Biaya perjalanan',
  settlements: 'Rekap uang jalan',
  p2h: 'P2H',
  media: 'Media (foto)',
  p2h_items: 'Checklist P2H',
  expense_categories: 'Kategori biaya',
  settings: 'Pengaturan aplikasi',
}

const catalog = () => ({
  actions: ACTIONS,
  resources: Object.entries(RESOURCES).map(([key, label]) => ({ key, label, actions: ACTIONS })),
})

/** Semua hak (untuk Administrator). */
const all = () => Object.fromEntries(Object.keys(RESOURCES).map((r) => [r, [...ACTIONS]]))

/** Rapikan matriks dari request: buang duplikat, urut sesuai ACTIONS. Modul/aksi asing ditolak (422). */
const normalize = (input, field = 'permissions') => {
  const details = []
  const result = {}
  Object.entries(input || {}).forEach(([resource, actions]) => {
    if (!RESOURCES[resource]) {
      details.push({ field: `${field}.${resource}`, message: `Modul "${resource}" tidak dikenal.` })
      return
    }
    const bad = actions.filter((a) => !ACTIONS.includes(a))
    if (bad.length) {
      details.push({ field: `${field}.${resource}`, message: `Aksi tidak dikenal: ${bad.join(', ')}.` })
      return
    }
    const unique = ACTIONS.filter((a) => actions.includes(a))
    if (unique.length) result[resource] = unique
  })
  if (details.length) throw new AppError('VALIDATION_ERROR', { details })
  return result
}

const can = (permissions, resource, action) => Boolean(permissions && permissions[resource] && permissions[resource].includes(action))

/** Apakah `target` tidak melebihi `actor` (mencegah memberi hak yang tidak dimiliki sendiri). */
const isSubset = (actor, target) => Object.entries(target).every(([resource, actions]) => actions.every((a) => can(actor, resource, a)))

module.exports = {
  ACTIONS, RESOURCES, catalog, all, normalize, can, isSubset,
}
