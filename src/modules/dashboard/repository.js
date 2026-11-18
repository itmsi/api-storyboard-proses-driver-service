const { doWorkDateSql, holdsOnDateSql, RUNNING_DO_STATUSES } = require('../../utils/master')

// Semua angka dashboard dihitung dari DO yang tanggal kerjanya (jadwal muat, atau waktu penugasan bila tanpa jadwal; WIB)
// ada di rentang start_date..end_date, sama dengan filter from/to di POST /delivery-orders/get.
const inRange = (db, alias, range) => db.raw(`${doWorkDateSql(alias)} BETWEEN ?::date AND ?::date`, [range.startDate, range.endDate])

const RUNNING_SQL = RUNNING_DO_STATUSES.map((s) => `'${s}'`).join(', ')

/** Kelompok status DO di dashboard. Gagal kirim = DO selesai dengan hasil serah terima gagal_kirim. */
const BUCKET_SQL = `CASE
  WHEN delivery_orders.status = 'completed' AND delivery_orders.delivery_status = 'gagal_kirim' THEN 'failed'
  WHEN delivery_orders.status = 'completed' THEN 'completed'
  WHEN delivery_orders.status IN (${RUNNING_SQL}) THEN 'running'
  ELSE delivery_orders.status
END`

/** Jumlah DO per (customer, kelompok status). Baris customer_id null = DO tanpa customer. */
const doCounts = (db, range) => db('delivery_orders')
  .leftJoin('customers', 'customers.id', 'delivery_orders.customer_id')
  .where(inRange(db, 'delivery_orders', range))
  .groupBy('delivery_orders.customer_id', 'customers.name', db.raw(BUCKET_SQL))
  .select(
    'delivery_orders.customer_id',
    'customers.name as customer_name',
    db.raw(`${BUCKET_SQL} as bucket`),
    db.raw('count(*)::int as count')
  )

/** Data sync dari HP yang masih gagal (antre) milik DO yang belum selesai, atau tanpa DO. */
const pendingSyncCount = async (db) => {
  const [{ count }] = await db('sync_items')
    .leftJoin('delivery_orders', 'delivery_orders.id', 'sync_items.delivery_order_id')
    .where('sync_items.status', 'failed')
    .where((q) => q.whereNull('delivery_orders.id').orWhereNotIn('delivery_orders.status', ['completed', 'cancelled']))
    .count('sync_items.id as count')
  return Number(count)
}

/** Uang jalan, biaya, dan settlement dari DO di rentang (DO batal tidak dihitung). */
const financeTotals = async (db, range) => {
  const dos = () => db('delivery_orders')
    .where(inRange(db, 'delivery_orders', range))
    .whereNot('delivery_orders.status', 'cancelled')

  const [allowance, expenses, settlements] = await Promise.all([
    dos().first(
      db.raw('count(*)::int as do_count'),
      db.raw('coalesce(sum(delivery_orders.travel_allowance_amount), 0) as travel_allowance_total')
    ),
    dos()
      .join('expenses', 'expenses.delivery_order_id', 'delivery_orders.id')
      .join('expense_categories', 'expense_categories.code', 'expenses.category_code')
      .whereNull('expenses.voided_at')
      .first(
        db.raw('coalesce(sum(expenses.amount), 0) as total'),
        db.raw("coalesce(sum(expenses.amount) filter (where expense_categories.input = 'receipt_ocr'), 0) as receipt_total"),
        db.raw("coalesce(sum(expenses.amount) filter (where expense_categories.input <> 'receipt_ocr'), 0) as manual_total"),
        db.raw('count(expenses.id)::int as count')
      ),
    dos()
      .join('settlements', 'settlements.delivery_order_id', 'delivery_orders.id')
      .first(
        db.raw('count(*) filter (where settlements.settled_at is not null)::int as settled_count'),
        db.raw("coalesce(sum(settlements.amount) filter (where settlements.type = 'refund_to_company'), 0) as refund_total"),
        db.raw("coalesce(sum(settlements.amount) filter (where settlements.type = 'refund_to_company' and settlements.settled_at is null), 0) as refund_unsettled"),
        db.raw("coalesce(sum(settlements.amount) filter (where settlements.type = 'payable_to_driver'), 0) as payable_total"),
        db.raw("coalesce(sum(settlements.amount) filter (where settlements.type = 'payable_to_driver' and settlements.settled_at is null), 0) as payable_unsettled"),
        db.raw("count(*) filter (where settlements.settled_at is null and settlements.type <> 'balanced')::int as pending_count")
      ),
  ])
  return { allowance, expenses, settlements }
}

/** Rekap yang belum disetor/dibayar (selain yang pas), paling lama selesai lebih dulu. */
const pendingSettlements = (db, range, limit) => db('settlements')
  .join('delivery_orders', 'delivery_orders.id', 'settlements.delivery_order_id')
  .join('drivers', 'drivers.id', 'delivery_orders.driver_id')
  .join('users as driver_user', 'driver_user.id', 'drivers.user_id')
  .where(inRange(db, 'delivery_orders', range))
  .whereNull('settlements.settled_at')
  .whereNot('settlements.type', 'balanced')
  .orderBy('delivery_orders.completed_at', 'asc')
  .orderBy('delivery_orders.id', 'asc')
  .limit(limit)
  .select(
    'delivery_orders.id as delivery_order_id',
    'delivery_orders.no as delivery_order_no',
    'delivery_orders.delivery_status',
    'delivery_orders.completed_at',
    'drivers.id as driver_id',
    'drivers.code as driver_code',
    'driver_user.name as driver_name',
    'settlements.type',
    'settlements.amount'
  )

/**
 * Unit aktif beserta P2H yang berlaku pada `date` (null = belum P2H), catatan item tidak sesuai, dan tanda bila
 * P2H sebelumnya diminta ulang admin.
 */
const unitsP2h = (db, date) => db('units')
  .leftJoin('p2h_inspections as i', (j) => j
    .on('i.unit_id', 'units.id')
    .andOn('i.inspection_date', db.raw('?::date', [date]))
    .andOnNull('i.superseded_at')
    .andOn('i.is_delete', db.raw('false')))
  .where({ 'units.is_delete': false, 'units.status': 'active' })
  .orderBy('units.plate')
  .select(
    'units.id',
    'units.plate',
    'units.unit_type',
    'i.id as inspection_id',
    'i.status as p2h_status',
    'i.checked_at',
    'i.admin_confirmed_by_driver',
    db.raw(`(SELECT string_agg(ii.description, '; ' ORDER BY ii.label)
      FROM p2h_inspection_items ii WHERE ii.inspection_id = i.id AND ii.result = 'tidak_sesuai') as note`),
    db.raw(`EXISTS (SELECT 1 FROM p2h_inspections old WHERE old.unit_id = units.id AND old.inspection_date = ?::date
      AND old.is_delete = false AND old.superseded_at IS NOT NULL AND old.recheck_requested_at IS NOT NULL) as recheck_requested`, [date])
  )

/** DO yang memegang unit-unit ini pada `date` (untuk "DO-0146 menunggu · driver Sari"); DO tanggal itu lebih dulu. */
const doHoldingUnits = (db, unitIds, date) => (unitIds.length ? db('delivery_orders')
  .join('drivers', 'drivers.id', 'delivery_orders.driver_id')
  .join('users as driver_user', 'driver_user.id', 'drivers.user_id')
  .whereIn('delivery_orders.unit_id', unitIds)
  .whereRaw(holdsOnDateSql('delivery_orders', '?::date'), [date, date])
  .orderByRaw(`(${doWorkDateSql('delivery_orders')} = ?::date) DESC`, [date])
  .orderBy('delivery_orders.created_at')
  .select(
    'delivery_orders.unit_id',
    'delivery_orders.id',
    'delivery_orders.no',
    'delivery_orders.status',
    'drivers.id as driver_id',
    'driver_user.name as driver_name'
  ) : Promise.resolve([]))

module.exports = {
  doCounts, pendingSyncCount, financeTotals, pendingSettlements, unitsP2h, doHoldingUnits,
}
