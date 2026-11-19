const { withAuditNames } = require('../../utils/audit')

const ACTIVE_STATUSES = ['accepted', 'loading', 'in_transit', 'handover']

/** DO + unit + driver. Selalu dibatasi ke driver yang login (data driver lain tidak pernah terbaca). */
const base = (db, driverId) => withAuditNames(
  db('delivery_orders')
    .join('units', 'units.id', 'delivery_orders.unit_id')
    .join('drivers', 'drivers.id', 'delivery_orders.driver_id')
    .join('users as driver_user', 'driver_user.id', 'drivers.user_id')
    .where('delivery_orders.is_delete', false) // DO yang sudah dihapus admin tidak pernah terbaca
    .modify((q) => { if (driverId) q.where('delivery_orders.driver_id', driverId) }) // driverId kosong = semua driver (admin)
    .select(
      'delivery_orders.*',
      'units.plate as unit_plate',
      'units.unit_type as unit_type',
      'drivers.code as driver_code',
      'driver_user.name as driver_name',
      'driver_user.phone as driver_phone'
    ),
  'delivery_orders'
)

const list = (db, driverId, statuses) => base(db, driverId)
  .whereIn('delivery_orders.status', statuses)
  .orderBy([{ column: 'delivery_orders.planned_load_at', order: 'asc' }, { column: 'delivery_orders.assigned_at', order: 'asc' }])

const findOwned = (db, driverId, id) => base(db, driverId).where('delivery_orders.id', id).first()

const findOwnedForUpdate = (trx, driverId, id) => trx('delivery_orders').where({ id, driver_id: driverId, is_delete: false }).forUpdate().first()

const countAssigned = async (db, driverId) => {
  const [{ count }] = await db('delivery_orders').where({ driver_id: driverId, status: 'assigned', is_delete: false }).count('id as count')
  return Number(count)
}

const findActive = (db, driverId) => db('delivery_orders')
  .where({ driver_id: driverId })
  .whereIn('status', ACTIVE_STATUSES)
  .first('id', 'no')

/** DO lain yang sedang berjalan dengan unit ini (driver mana pun): satu unit tidak bisa dipakai dua DO bersamaan. */
const findUnitInUse = (db, unitId, exceptDoId) => db('delivery_orders')
  .join('drivers', 'drivers.id', 'delivery_orders.driver_id')
  .join('users', 'users.id', 'drivers.user_id')
  .where('delivery_orders.unit_id', unitId)
  .whereNot('delivery_orders.id', exceptDoId)
  .whereIn('delivery_orders.status', ACTIVE_STATUSES)
  .first('delivery_orders.id', 'delivery_orders.no', 'delivery_orders.status', 'drivers.code as driver_code', 'users.name as driver_name')

/** Kunci per unit sampai transaksi selesai, agar dua driver tidak menerima DO dengan unit yang sama pada saat bersamaan. */
const lockUnit = (trx, unitId) => trx.raw('SELECT pg_advisory_xact_lock(hashtext(?))', [`unit:${unitId}`])

/**
 * Riwayat: SEMUA DO (status apa pun, tidak menunggu selesai) yang tanggal kerjanya (jadwal muat, atau waktu penugasan bila tanpa
 * jadwal; sama dengan filter from/to di daftar admin dan dashboard) ada di rentang, terbaru dulu. cursor = (tanggal kerja, id) terakhir halaman sebelumnya.
 * driverId kosong = semua driver (admin). statuses null = semua status; array kosong = tidak ada yang cocok.
 */
const HISTORY_AT = 'coalesce(delivery_orders.planned_load_at, delivery_orders.assigned_at)'

const history = (db, driverId, {
  from, to, limit, cursor, statuses,
}) => base(db, driverId)
  .select(db.raw(`${HISTORY_AT} as sort_at`))
  .whereRaw(`${HISTORY_AT} BETWEEN ? AND ?`, [from, to])
  .modify((q) => {
    if (statuses) q.whereIn('delivery_orders.status', statuses)
    if (cursor) q.whereRaw(`(${HISTORY_AT}, delivery_orders.id) < (?, ?)`, [cursor.sortAt, cursor.id])
  })
  .orderByRaw(`${HISTORY_AT} DESC, delivery_orders.id DESC`)
  .limit(limit + 1) // satu baris ekstra untuk has_more

/** Ringkasan rentang yang sama, per status (jumlah DO, jarak odometer yang lengkap, total biaya). */
const historySummary = (db, driverId, { from, to, statuses }) => db('delivery_orders')
  .where({ is_delete: false })
  .whereRaw(`${HISTORY_AT} BETWEEN ? AND ?`, [from, to])
  .modify((q) => {
    if (driverId) q.where({ driver_id: driverId })
    if (statuses) q.whereIn('status', statuses)
  })
  .groupBy('status')
  .select(
    'status',
    db.raw('count(*)::int as do_count'),
    db.raw('coalesce(sum(odometer_end_km - odometer_start_km) filter (where odometer_end_km is not null and odometer_start_km is not null), 0) as distance_km'),
    db.raw('coalesce(sum(expense_total), 0) as expense_total')
  )

const findEventByClientRef = (db, actorId, clientRef) => db('delivery_order_events')
  .where({ actor_id: actorId, client_ref: clientRef })
  .first()

const markAccepted = async (trx, id, fields) => {
  const [row] = await trx('delivery_orders')
    .where({ id, status: 'assigned', is_delete: false }) // jaga race: hanya satu request yang menang
    .update(fields)
    .returning('*')
  return row
}

/** Ubah DO hanya jika statusnya masih salah satu dari `statuses` (jaga race antar-request). */
const updateIfStatus = async (trx, id, statuses, fields) => {
  const [row] = await trx('delivery_orders').where({ id, is_delete: false }).whereIn('status', statuses).update(fields)
    .returning('*')
  return row
}

const insertEvent = (trx, event) => trx('delivery_order_events').insert(event)

module.exports = {
  ACTIVE_STATUSES,
  list,
  findOwned,
  findOwnedForUpdate,
  countAssigned,
  findActive,
  findUnitInUse,
  lockUnit,
  history,
  historySummary,
  findEventByClientRef,
  markAccepted,
  updateIfStatus,
  insertEvent,
}
