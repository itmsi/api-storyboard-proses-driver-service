const { withAuditNames } = require('../../utils/audit')

const ACTIVE_STATUSES = ['accepted', 'loading', 'in_transit', 'handover']

/** DO + unit + driver. Selalu dibatasi ke driver yang login (data driver lain tidak pernah terbaca). */
const base = (db, driverId) => withAuditNames(
  db('delivery_orders')
    .join('units', 'units.id', 'delivery_orders.unit_id')
    .join('unit_types', 'unit_types.id', 'units.unit_type_id')
    .join('drivers', 'drivers.id', 'delivery_orders.driver_id')
    .join('users as driver_user', 'driver_user.id', 'drivers.user_id')
    .where('delivery_orders.driver_id', driverId)
    .select(
      'delivery_orders.*',
      'units.plate as unit_plate',
      'unit_types.name as unit_type',
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

const findOwnedForUpdate = (trx, driverId, id) => trx('delivery_orders').where({ id, driver_id: driverId }).forUpdate().first()

const countAssigned = async (db, driverId) => {
  const [{ count }] = await db('delivery_orders').where({ driver_id: driverId, status: 'assigned' }).count('id as count')
  return Number(count)
}

const findActive = (db, driverId) => db('delivery_orders')
  .where({ driver_id: driverId })
  .whereIn('status', ACTIVE_STATUSES)
  .first('id', 'no')

/** Riwayat: DO selesai dalam rentang waktu, terbaru dulu; cursor = (completed_at, id) terakhir halaman sebelumnya. */
const history = (db, driverId, {
  from, to, limit, cursor,
}) => base(db, driverId)
  .where('delivery_orders.status', 'completed')
  .whereBetween('delivery_orders.completed_at', [from, to])
  .modify((q) => {
    if (cursor) q.whereRaw('(delivery_orders.completed_at, delivery_orders.id) < (?, ?)', [cursor.completedAt, cursor.id])
  })
  .orderBy([{ column: 'delivery_orders.completed_at', order: 'desc' }, { column: 'delivery_orders.id', order: 'desc' }])
  .limit(limit + 1) // satu baris ekstra untuk has_more

const historySummary = (db, driverId, { from, to }) => db('delivery_orders')
  .where({ driver_id: driverId, status: 'completed' })
  .whereBetween('completed_at', [from, to])
  .select(
    db.raw('count(*) as do_count'),
    db.raw('coalesce(sum(odometer_end_km - odometer_start_km), 0) as distance_km'),
    db.raw('coalesce(sum(expense_total), 0) as expense_total')
  )
  .first()

const findEventByClientRef = (db, actorId, clientRef) => db('delivery_order_events')
  .where({ actor_id: actorId, client_ref: clientRef })
  .first()

const markAccepted = async (trx, id, fields) => {
  const [row] = await trx('delivery_orders')
    .where({ id, status: 'assigned' }) // jaga race: hanya satu request yang menang
    .update(fields)
    .returning('*')
  return row
}

/** Ubah DO hanya jika statusnya masih salah satu dari `statuses` (jaga race antar-request). */
const updateIfStatus = async (trx, id, statuses, fields) => {
  const [row] = await trx('delivery_orders').where({ id }).whereIn('status', statuses).update(fields)
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
  history,
  historySummary,
  findEventByClientRef,
  markAccepted,
  updateIfStatus,
  insertEvent,
}
