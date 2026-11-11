const { withAuditNames } = require('../../utils/audit')
const { searchColumns } = require('../../utils/pagination')

const base = (db) => db('expense_categories').where('expense_categories.is_delete', false)

// expense_count = jumlah biaya yang memakai kategori ini (membantu admin sebelum mengubah/menonaktifkan)
const select = (db, query) => query.select(
  'expense_categories.code',
  'expense_categories.label',
  'expense_categories.input',
  'expense_categories.description_required',
  'expense_categories.proof_required',
  'expense_categories.sort_order',
  'expense_categories.is_active',
  db('expenses').where('expenses.category_code', db.ref('expense_categories.code')).count('*').as('expense_count'),
  'expense_categories.created_at',
  'expense_categories.created_by',
  'expense_categories.updated_at',
  'expense_categories.updated_by'
)

const list = async (db, { search, isActive, paging }) => {
  const filtered = () => {
    const q = searchColumns(base(db), search, ['expense_categories.code', 'expense_categories.label'])
    if (isActive !== undefined) q.where('expense_categories.is_active', isActive)
    return q
  }
  const [{ count }] = await filtered().count('expense_categories.code as count')
  const rows = await withAuditNames(select(db, filtered()), 'expense_categories')
    .orderBy(paging.column, paging.direction)
    .orderBy('expense_categories.code')
    .limit(paging.limit)
    .offset(paging.offset)
  return { rows, total: Number(count) }
}

const findByCode = (db, code) => withAuditNames(select(db, base(db)).where('expense_categories.code', code), 'expense_categories').first()

/** Termasuk yang sudah dihapus: kode tetap dipakai (rujukan biaya lama), jadi tidak bisa dibuat ulang. */
const findAnyByCode = (db, code) => db('expense_categories').where({ code }).first('code', 'is_delete')

const insert = (db, row) => db('expense_categories').insert(row)

const update = (db, code, fields) => db('expense_categories').where({ code }).update(fields)

const countOtherActive = async (db, exceptCode) => {
  const [{ count }] = await db('expense_categories').where({ is_active: true, is_delete: false }).whereNot({ code: exceptCode }).count('code as count')
  return Number(count)
}

const softDelete = (db, code, actorId) => db('expense_categories').where({ code }).update({
  is_delete: true, is_active: false, deleted_at: db.fn.now(), deleted_by: actorId, updated_by: actorId,
})

const nextSortOrder = async (db) => {
  const [{ max }] = await db('expense_categories').max('sort_order as max')
  return (max === null ? 0 : Number(max)) + 1
}

module.exports = {
  list, findByCode, findAnyByCode, insert, update, softDelete, countOtherActive, nextSortOrder,
}
