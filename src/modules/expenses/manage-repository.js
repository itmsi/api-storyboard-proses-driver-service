const { searchColumns } = require('../../utils/pagination')

// Query sisi admin: biaya semua DO di perusahaan ini (tidak dibatasi ke satu driver).

const base = (db) => db('expenses')
  .join('delivery_orders', 'delivery_orders.id', 'expenses.delivery_order_id')
  .join('drivers', 'drivers.id', 'delivery_orders.driver_id')
  .join('users as driver_user', 'driver_user.id', 'drivers.user_id')
  .join('expense_categories', 'expense_categories.code', 'expenses.category_code')
  .leftJoin('media as proof', 'proof.id', 'expenses.proof_media_id')
  .leftJoin('users as void_user', 'void_user.id', 'expenses.voided_by')

const select = (query) => query.select(
  'expenses.*',
  'delivery_orders.no as do_no',
  'delivery_orders.status as do_status',
  'delivery_orders.driver_id as driver_id',
  'drivers.code as driver_code',
  'driver_user.name as driver_name',
  'expense_categories.label as category_label',
  'expense_categories.input as category_input',
  'proof.storage_key as proof_key',
  'proof.thumb_key as proof_thumb_key',
  'void_user.name as voided_by_name'
)

const list = async (db, { search, filters, paging }) => {
  const filtered = () => {
    const q = searchColumns(base(db), search, ['delivery_orders.no', 'expenses.description', 'expenses.fuel_type', 'driver_user.name', 'drivers.code'])
    if (filters.deliveryOrderId) q.where('expenses.delivery_order_id', filters.deliveryOrderId)
    if (filters.driverId) q.where('delivery_orders.driver_id', filters.driverId)
    if (filters.category) q.where('expenses.category_code', filters.category)
    if (filters.voided === true) q.whereNotNull('expenses.voided_at')
    if (filters.voided === false) q.whereNull('expenses.voided_at')
    if (filters.from) q.where('expenses.recorded_at', '>=', filters.from)
    if (filters.to) q.where('expenses.recorded_at', '<=', filters.to)
    return q
  }
  const [{ count }] = await filtered().count('expenses.id as count')
  const rows = await select(filtered())
    .orderBy(paging.column, paging.direction)
    .orderBy('expenses.id')
    .limit(paging.limit)
    .offset(paging.offset)
  return { rows, total: Number(count) }
}

const findById = (db, id) => select(base(db)).where('expenses.id', id).first()

const findSettlement = (db, deliveryOrderId) => db('settlements').where({ delivery_order_id: deliveryOrderId }).first()

/** Tandai biaya dibatalkan (tidak dihapus: jejak tetap ada). Hanya jika masih berlaku. */
const markVoided = async (trx, id, adminId, reason) => {
  const [row] = await trx('expenses')
    .where({ id })
    .whereNull('voided_at')
    .update({
      voided_at: trx.fn.now(), voided_by: adminId, void_reason: reason, updated_by: adminId,
    })
    .returning('id')
  return row
}

const orderTotals = (trx, deliveryOrderId) => trx('delivery_orders')
  .where({ id: deliveryOrderId })
  .first('expense_total', 'travel_allowance_amount')

const updateSettlement = (trx, deliveryOrderId, fields) => trx('settlements').where({ delivery_order_id: deliveryOrderId }).update(fields)

module.exports = {
  list, findById, findSettlement, markVoided, orderTotals, updateSettlement,
}
