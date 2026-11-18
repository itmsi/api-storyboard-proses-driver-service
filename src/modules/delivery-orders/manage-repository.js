const { withAuditNames } = require('../../utils/audit')
const { searchColumns } = require('../../utils/pagination')
const cargo = require('./cargo')
const { holdsOnDateSql } = require('../../utils/master')

// Query sisi admin: semua DO di perusahaan ini (tidak dibatasi ke satu driver seperti repository.js)

const base = (db) => db('delivery_orders')
  .join('drivers', 'drivers.id', 'delivery_orders.driver_id')
  .join('users as driver_user', 'driver_user.id', 'drivers.user_id')
  .join('units', 'units.id', 'delivery_orders.unit_id')
  .leftJoin('customers', 'customers.id', 'delivery_orders.customer_id')

const select = (query) => query.select(
  'delivery_orders.*',
  'drivers.code as driver_code',
  'driver_user.name as driver_name',
  'units.plate as unit_plate',
  'units.unit_type as unit_type',
  'units.driver_id as unit_default_driver_id',
  'customers.name as customer_name'
)

const list = async (db, {
  search, filters, paging,
}) => {
  const filtered = () => {
    const q = searchColumns(base(db), search, [
      'delivery_orders.no', cargo.SEARCH_SQL, 'driver_user.name', 'drivers.code', 'units.plate', 'customers.name',
      // rute: nama dan kota lokasi asal dan tujuan (salinan di DO)
      "delivery_orders.origin_snapshot->>'name'", "delivery_orders.origin_snapshot->>'city'",
      "delivery_orders.destination_snapshot->>'name'", "delivery_orders.destination_snapshot->>'city'",
    ])
    if (filters.statuses && filters.statuses.length) q.whereIn('delivery_orders.status', filters.statuses)
    if (filters.deliveryStatus) q.where('delivery_orders.delivery_status', filters.deliveryStatus)
    if (filters.originLocationId) q.where('delivery_orders.origin_location_id', filters.originLocationId)
    if (filters.destinationLocationId) q.where('delivery_orders.destination_location_id', filters.destinationLocationId)
    if (filters.settlementStatus === 'none') q.whereNotExists(function none() { this.select(db.raw('1')).from('settlements').whereRaw('settlements.delivery_order_id = delivery_orders.id') })
    if (filters.settlementStatus === 'pending') q.whereExists(function pending() { this.select(db.raw('1')).from('settlements').whereRaw('settlements.delivery_order_id = delivery_orders.id').whereNull('settlements.settled_at') })
    if (filters.settlementStatus === 'settled') q.whereExists(function settled() { this.select(db.raw('1')).from('settlements').whereRaw('settlements.delivery_order_id = delivery_orders.id').whereNotNull('settlements.settled_at') })
    if (filters.completedFrom) q.where('delivery_orders.completed_at', '>=', filters.completedFrom)
    if (filters.completedTo) q.where('delivery_orders.completed_at', '<=', filters.completedTo)
    if (filters.driverId) q.where('delivery_orders.driver_id', filters.driverId)
    if (filters.unitId) q.where('delivery_orders.unit_id', filters.unitId)
    if (filters.customerId) q.where('delivery_orders.customer_id', filters.customerId)
    if (filters.needsReview !== undefined && filters.needsReview !== null) q.where('delivery_orders.needs_review', filters.needsReview)
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
  .first('drivers.id', 'drivers.code', 'drivers.status as driver_status', 'users.status as user_status', 'users.name')

const findUnit = (db, id) => db('units').where({ id, is_delete: false }).first('id', 'plate', 'status')

const findCustomer = (db, id) => db('customers').where({ id, is_delete: false }).first('id', 'name')

const findLocation = (db, id) => db('locations').where({ id, is_delete: false }).first(
  'id',
  'type',
  'name',
  'address',
  'city',
  'maps_url',
  'lat',
  'lng',
  'customer_id',
  'operating_hours',
  'pic_name',
  'pic_phone'
)

/**
 * DO milik driver pada tanggal kerja tsb yang masih "memakai" hari kerjanya (master.holdsOnDateSql: DO pada tanggal itu
 * assigned sampai completed, atau DO lintas hari yang masih berjalan).
 * exceptId: DO yang sedang diubah/dilanjutkan tidak dihitung. unitId: hanya DO dengan unit itu.
 */
const findDriverOrdersOnDate = (db, {
  driverId, date, exceptId, unitId,
}) => {
  const q = db('delivery_orders')
    .join('units', 'units.id', 'delivery_orders.unit_id')
    .where('delivery_orders.driver_id', driverId)
    .whereRaw(holdsOnDateSql('delivery_orders', '?::date'), [date, date])
    .orderBy('delivery_orders.created_at')
    .select('delivery_orders.id', 'delivery_orders.no', 'delivery_orders.status', 'delivery_orders.unit_id', 'units.plate as unit_plate')
  if (exceptId) q.whereNot('delivery_orders.id', exceptId)
  if (unitId) q.where('delivery_orders.unit_id', unitId)
  return q
}

/** DO unit itu pada tanggal kerja tsb yang dipegang driver lain (exceptDriverId = driver yang sedang diperiksa). */
const findUnitOrdersOnDate = (db, {
  unitId, date, exceptId, exceptDriverId,
}) => {
  const q = db('delivery_orders')
    .join('drivers', 'drivers.id', 'delivery_orders.driver_id')
    .join('users', 'users.id', 'drivers.user_id')
    .where('delivery_orders.unit_id', unitId)
    .whereRaw(holdsOnDateSql('delivery_orders', '?::date'), [date, date])
    .orderBy('delivery_orders.created_at')
    .select('delivery_orders.id', 'delivery_orders.no', 'delivery_orders.status', 'drivers.id as driver_id', 'drivers.code as driver_code', 'users.name as driver_name')
  if (exceptId) q.whereNot('delivery_orders.id', exceptId)
  if (exceptDriverId) q.whereNot('delivery_orders.driver_id', exceptDriverId)
  return q
}

const insert = async (trx, row) => {
  const [created] = await trx('delivery_orders').insert(row).returning('id')
  return created.id
}

// ---- Bagian-bagian detail ----

const events = (db, doId) => db('delivery_order_events')
  .leftJoin('users', 'users.id', 'delivery_order_events.actor_id')
  .leftJoin('roles', 'roles.id', 'users.role_id')
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
    'roles.user_type as actor_role'
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

/** Foto bacaan/struk (untuk tampilan admin). */
const mediaByIds = (db, ids) => (ids.length ? db('media').whereIn('id', ids) : Promise.resolve([]))

/** Status pengecekan AI yang tertaut ke bacaan/struk. */
const aiChecksByIds = (db, ids) => (ids.length ? db('ai_checks').whereIn('id', ids).select('id', 'status', 'error_code', 'error_message', db.raw("result->>'note' as note"), db.raw("result->>'display_mode' as display_mode"), db.raw("(result->>'odo_km')::int as odo_km"), db.raw("(result->>'trip_km')::numeric::float8 as trip_km"), db.raw("(result->>'fuel_percent')::int as fuel_percent"), db.raw("result->'extras' as extras")) : Promise.resolve([]))

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
  findDriverOrdersOnDate,
  findUnitOrdersOnDate,
  insert,
  events,
  loading,
  odometers,
  expenses,
  handover,
  settlement,
  media,
  mediaByIds,
  aiChecksByIds,
}
