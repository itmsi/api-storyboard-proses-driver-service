const { searchColumns } = require('../../utils/pagination')

const base = (db) => db('settlements')
  .join('delivery_orders', 'delivery_orders.id', 'settlements.delivery_order_id')
  .join('drivers', 'drivers.id', 'delivery_orders.driver_id')
  .join('users as driver_user', 'driver_user.id', 'drivers.user_id')
  .join('units', 'units.id', 'delivery_orders.unit_id')
  .leftJoin('users as settler', 'settler.id', 'settlements.settled_by')

const select = (query) => query.select(
  'settlements.*',
  'delivery_orders.no as do_no',
  'delivery_orders.completed_at',
  'delivery_orders.origin_snapshot',
  'delivery_orders.destination_snapshot',
  'delivery_orders.driver_id',
  'drivers.code as driver_code',
  'driver_user.name as driver_name',
  'units.plate as unit_plate',
  'settler.name as settled_by_name'
)

const filteredQuery = (db, { search, filters }) => {
  const q = searchColumns(base(db), search, ['delivery_orders.no', 'driver_user.name', 'drivers.code', 'units.plate'])
  if (filters.type) q.where('settlements.type', filters.type)
  if (filters.settled === true) q.whereNotNull('settlements.settled_at')
  if (filters.settled === false) q.whereNull('settlements.settled_at')
  if (filters.driverId) q.where('delivery_orders.driver_id', filters.driverId)
  if (filters.from) q.where('delivery_orders.completed_at', '>=', filters.from)
  if (filters.to) q.where('delivery_orders.completed_at', '<=', filters.to)
  return q
}

const list = async (db, { search, filters, paging }) => {
  const [totals] = await filteredQuery(db, { search, filters }).select(
    db.raw('count(*)::int as do_count'),
    db.raw("coalesce(sum(case when settlements.type = 'refund_to_company' then settlements.amount end), 0) as refund_total"),
    db.raw("coalesce(sum(case when settlements.type = 'payable_to_driver' then settlements.amount end), 0) as payable_total"),
    db.raw('count(*) filter (where settlements.settled_at is null and settlements.type <> ?)::int as unsettled_count', ['balanced'])
  )
  const rows = await select(filteredQuery(db, { search, filters }))
    .orderBy(paging.column, paging.direction)
    .orderBy('settlements.delivery_order_id')
    .limit(paging.limit)
    .offset(paging.offset)
  return { rows, totals }
}

const findByDeliveryOrder = (db, deliveryOrderId) => select(base(db)).where('settlements.delivery_order_id', deliveryOrderId).first()

/** Tandai lunas hanya jika belum pernah ditandai (jaga race dua admin sekaligus). */
const markSettled = async (db, deliveryOrderId, fields) => {
  const [row] = await db('settlements')
    .where({ delivery_order_id: deliveryOrderId })
    .whereNull('settled_at')
    .update(fields)
    .returning('delivery_order_id')
  return row
}

module.exports = { list, findByDeliveryOrder, markSettled }
