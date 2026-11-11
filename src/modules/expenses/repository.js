const withCategory = (db) => db('expenses')
  .join('expense_categories', 'expense_categories.code', 'expenses.category_code')
  .select('expenses.*', 'expense_categories.input as category_input', 'expense_categories.label as category_label')

const findCategory = (db, code) => db('expense_categories').where({ code, is_active: true, is_delete: false }).first()

const findByClientRef = (db, userId, clientRef) => withCategory(db)
  .where({ 'expenses.created_by': userId, 'expenses.client_ref': clientRef })
  .first()

const listForDo = (db, doId) => withCategory(db)
  .where({ 'expenses.delivery_order_id': doId })
  .whereNull('expenses.voided_at')
  .orderBy([{ column: 'expenses.recorded_at', order: 'asc' }, { column: 'expenses.created_at', order: 'asc' }])

const findMedia = (db, id) => db('media').where({ id }).first()

/** Struk yang sudah terpakai: fingerprint isi struk sama, atau foto yang sama (sha256) sudah jadi bukti biaya lain. */
const findDuplicateReceipt = (db, { fingerprint, sha256 }) => db('expenses')
  .join('delivery_orders', 'delivery_orders.id', 'expenses.delivery_order_id')
  .leftJoin('media', 'media.id', 'expenses.proof_media_id')
  .whereNull('expenses.voided_at')
  .where((q) => {
    if (fingerprint) q.orWhere('expenses.receipt_fingerprint', fingerprint)
    if (sha256) q.orWhere('media.sha256', sha256)
  })
  .select('expenses.id as expense_id', 'delivery_orders.no as delivery_order_no')
  .first()

const insert = async (trx, row) => {
  const [created] = await trx('expenses').insert(row).returning('*')
  return created
}

/** Total biaya DO dihitung ulang dari baris biaya (bukan ditambah), supaya selalu konsisten. */
const refreshDoTotal = (trx, doId, userId) => trx('delivery_orders')
  .where({ id: doId })
  .update({
    // coalesce: tanpa biaya yang tersisa (semua dibatalkan) SUM bernilai NULL, padahal kolomnya wajib terisi
    expense_total: trx.raw('coalesce((select sum(amount) from expenses where delivery_order_id = ? and voided_at is null), 0)', [doId]),
    updated_by: userId,
  })

module.exports = {
  findCategory, findByClientRef, listForDo, findMedia, findDuplicateReceipt, insert, refreshDoTotal,
}
