const { AppError } = require('./errors')

/**
 * Hak akses per modul. Tiap role berisi { <modul>: [aksi, ...] } dan punya jenis akun (user_type):
 *  - admin  : modul pengelolaan (web admin), semua aksi read/create/update/delete.
 *  - driver : modul aplikasi HP (awalan "driver_"), aksi terbatas sesuai yang memang ada per modul.
 * Role bawaan Administrator (is_system, admin) otomatis memegang semua hak admin.
 * Role bawaan Driver (is_system, driver) memegang default permission driver (driverDefaults).
 *
 * Aksi: read (daftar dan detail), create, update (termasuk tindakan seperti batalkan, tandai lunas, reset password, terima DO), delete.
 */
const ACTIONS = ['read', 'create', 'update', 'delete']
const USER_TYPES = ['admin', 'driver']

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

/** Modul hak akun driver (aplikasi HP). Awalan "driver_" membedakannya dari modul admin. */
const DRIVER_RESOURCES = {
  driver_profile: { label: 'Profil, pengaturan, dan password sendiri', actions: ['read', 'update'] },
  driver_delivery_orders: { label: 'Delivery order milik sendiri (lihat, terima, selesai)', actions: ['read', 'update'] },
  driver_p2h: { label: 'P2H unit (template, hari ini, kirim)', actions: ['read', 'create'] },
  driver_trip: { label: 'Perjalanan: muat, odometer, serah terima', actions: ['create'] },
  driver_expenses: { label: 'Biaya perjalanan', actions: ['read', 'create'] },
  driver_media: { label: 'Foto milik sendiri', actions: ['read', 'create'] },
  driver_sync: { label: 'Sinkronisasi antrean offline', actions: ['create'] },
  driver_device: { label: 'Token notifikasi perangkat', actions: ['create'] },
}

/** Modul dan aksi yang boleh dimiliki sebuah jenis akun: { <modul>: { label, actions } }. */
const resourcesOf = (userType) => {
  if (userType === 'driver') return DRIVER_RESOURCES
  return Object.fromEntries(Object.entries(RESOURCES).map(([key, label]) => [key, { label, actions: ACTIONS }]))
}

/**
 * Hak minimum setiap role driver. Aplikasi HP selalu memanggil GET /config, /app/bootstrap, dan /me saat dibuka, jadi tanpa
 * driver_profile:read aplikasi tidak bisa dipakai sama sekali. Role driver yang tidak memuatnya ditolak.
 */
const DRIVER_REQUIRED = { driver_profile: ['read'] }

/** Default permission role Driver: semua aksi di semua modul driver. */
const driverDefaults = () => Object.fromEntries(Object.entries(DRIVER_RESOURCES).map(([key, def]) => [key, [...def.actions]]))

/** Katalog untuk menggambar matriks hak: tiap modul memuat jenis akunnya dan aksi yang tersedia. */
const catalog = () => ({
  actions: ACTIONS,
  user_types: USER_TYPES,
  resources: USER_TYPES.flatMap((userType) => Object.entries(resourcesOf(userType))
    .map(([key, def]) => ({
      key, label: def.label, user_type: userType, actions: def.actions,
    }))),
})

/** Semua hak admin (untuk Administrator). */
const all = () => Object.fromEntries(Object.keys(RESOURCES).map((r) => [r, [...ACTIONS]]))

/**
 * Rapikan matriks dari request: buang duplikat dan modul kosong, urut sesuai ACTIONS.
 * Modul yang bukan milik jenis akun role itu, atau aksi yang tidak tersedia pada modulnya, ditolak (422).
 */
const normalize = (input, field = 'permissions', userType = 'admin') => {
  const allowed = resourcesOf(userType)
  const details = []
  const result = {}
  Object.entries(input || {}).forEach(([resource, actions]) => {
    if (!allowed[resource]) {
      const other = userType === 'admin' ? DRIVER_RESOURCES[resource] : RESOURCES[resource]
      details.push({
        field: `${field}.${resource}`,
        message: other
          ? `Modul "${resource}" untuk akun ${userType === 'admin' ? 'driver' : 'admin'}, bukan akun ${userType}.`
          : `Modul "${resource}" tidak dikenal.`,
      })
      return
    }
    const bad = actions.filter((a) => !allowed[resource].actions.includes(a))
    if (bad.length) {
      details.push({
        field: `${field}.${resource}`,
        message: `Aksi tidak tersedia untuk modul ini: ${bad.join(', ')}. Yang tersedia: ${allowed[resource].actions.join(', ')}.`,
      })
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
  ACTIONS,
  USER_TYPES,
  RESOURCES,
  DRIVER_RESOURCES,
  DRIVER_REQUIRED,
  resourcesOf,
  driverDefaults,
  catalog,
  all,
  normalize,
  can,
  isSubset,
}
