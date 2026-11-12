const { withAuditNames } = require('../../utils/audit')
const { searchColumns } = require('../../utils/pagination')

// Query sisi admin: semua DO di perusahaan ini (tidak dibatasi ke satu driver seperti repository.js)

const base = (db) => db('delivery_orders')
  .join('drivers', 'drivers.id', 'delivery_orders.driver_id')
  .join('users as driver_user', 'driver_user.id', 'drivers.user_id')
  .join('units', 'units.id', 'delivery_orders.unit_id')
  .join('unit_types', 'unit_types.id', 'units.unit_type_id')
  .leftJoin('customers', 'customers.id', 'delivery_orders.customer_id')

const select = (query) => query.select(
  'delivery_orders.*',
  'drivers.code as driver_code',
  'driver_user.name as driver_name',
  'units.plate as unit_plate',
  'unit_types.name as unit_type',
  'customers.name as customer_name'
)

const list = async (db, {
  search, filters, paging,
}) => {
  const filtered = () => {
    const q = searchColumns(base(db), search, [
      'delivery_orders.no', 'delivery_orders.cargo_description', 'driver_user.name', 'drivers.code', 'units.plate', 'customers.name',
    ])
    if (filters.status) q.where('delivery_orders.status', filters.status)
    if (filters.driverId) q.where('delivery_orders.driver_id', filters.driverId)
    if (filters.unitId) q.where('delivery_orders.unit_id', filters.unitId)
    if (filters.customerId) q.where('delivery_orders.customer_id', filters.customerId)
    // Rentang tanggal memakai jadwal muat; DO tanpa jadwal memakai waktu penugasan
    if (filters.from) q.whereRaw('coalesce(delivery_orders.planned_load_at, delivery_orders.assigned_at) >= ?', [filters.from])
    if (filters.to) q.whereRaw('coalesce(delivery_orders.planned_load_at, delivery_orders.assigned_at) <= ?', [filters.to])
    return q
  }
  const [{ count }] = await filtered().count('delivery_orders.id as count')
  const rows = await withAuditNames(select(filtered()), 'delivery_orders')
    .orderBy(paging.column, paging.direction)
    .orderBy('delivery_orders.id')
    .limit(paging.limit)
    .offset(paging.offset)
  return { rows, total: Number(count) }
}

const findById = (db, id) => withAuditNames(select(base(db)).where('delivery_orders.id', id), 'delivery_orders').first()

// ---- Rujukan saat membuat/mengubah DO ----

const findDriver = (db, id) => db('drivers')
  .join('users', 'users.id', 'drivers.user_id')
  .where({ 'drivers.id': id, 'drivers.is_delete': false, 'users.is_delete': false })
  .first('drivers.id', 'drivers.status as driver_status', 'users.status as user_status', 'users.name')

const findUnit = (db, id) => db('units').where({ id, is_delete: false }).first('id', 'plate', 'status')

const findCustomer = (db, id) => db('customers').where({ id, is_delete: false }).first('id', 'name')

const findLocation = (db, id) => db('locations').where({ id, is_delete: false }).first(
  'id',
  'type',
  'name',
  'address',
  'city',
  'lat',
  'lng',
  'customer_id',
  'operating_hours',
  'pic_name',
  'pic_phone'
)

/** Nomor DO berikutnya dari sequence; lewati nomor yang sudah dipakai (mis. DO-0144 dari data awal). */
const nextNumber = async (db) => {
  for (let i = 0; i < 100; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    const { rows } = await db.raw("select nextval('delivery_order_no_seq') as n")
    const no = `DO-${String(rows[0].n).padStart(4, '0')}`
    // eslint-disable-next-line no-await-in-loop
    if (!(await db('delivery_orders').where({ no }).first('id'))) return no
  }
  throw new Error('tidak menemukan nomor DO yang kosong')
}

const insert = async (trx, row) => {
  const [created] = await trx('delivery_orders').insert(row).returning('id')
  return created.id
}

// ---- Bagian-bagian detail ----

const events = (db, doId) => db('delivery_order_events')
  .leftJoin('users', 'users.id', 'delivery_order_events.actor_id')
  .where({ 'delivery_order_events.delivery_order_id': doId })
  .orderBy('delivery_order_events.id')
  .select(
    'delivery_order_events.id',
    'delivery_order_events.event',
    'delivery_order_events.from_status',
    'delivery_order_events.to_status',
    'delivery_order_events.occurred_at',
    'delivery_order_events.lat',
    'delivery_order_events.lng',
    'delivery_order_events.payload',
    'users.id as actor_id',
    'users.name as actor_name',
    'users.user_type as actor_role'
  )

const loading = (db, doId) => db('loadings').where({ delivery_order_id: doId }).first()

const odometers = (db, doId) => db('odometer_readings').where({ delivery_order_id: doId }).orderBy('type', 'desc')

const expenses = (db, doId) => db('expenses')
  .join('expense_categories', 'expense_categories.code', 'expenses.category_code')
  .where({ 'expenses.delivery_order_id': doId })
  .orderBy('expenses.recorded_at')
  .select('expenses.*', 'expense_categories.label as category_label', 'expense_categories.input as category_input')

const handover = async (db, doId) => {
  const row = await db('handovers').where({ delivery_order_id: doId }).first()
  if (!row) return null
  const issues = await db('handover_issues')
    .leftJoin('handover_issue_photos', 'handover_issue_photos.issue_id', 'handover_issues.id')
    .where({ 'handover_issues.handover_id': row.id })
    .groupBy('handover_issues.id')
    .select('handover_issues.*', db.raw('count(handover_issue_photos.media_id)::int as photo_count'))
  return { ...row, issues }
}

const settlement = (db, doId) => db('settlements').where({ delivery_order_id: doId }).first()

const media = (db, doId) => db('delivery_order_media')
  .join('media', 'media.id', 'delivery_order_media.media_id')
  .where({ 'delivery_order_media.delivery_order_id': doId })
  .orderBy(['delivery_order_media.purpose', 'delivery_order_media.sort_order'])
  .select('media.*', 'delivery_order_media.purpose', 'delivery_order_media.page_no')

module.exports = {
  list,
  findById,
  findDriver,
  findUnit,
  findCustomer,
  findLocation,
  nextNumber,
  insert,
  events,
  loading,
  odometers,
  expenses,
  handover,
  settlement,
  media,
}
