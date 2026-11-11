const { withAuditNames } = require('../../utils/audit')
const { searchColumns } = require('../../utils/pagination')

const base = (db) => db('p2h_check_items')

const select = (query) => query.select(
  'p2h_check_items.code',
  'p2h_check_items.label',
  'p2h_check_items.hint',
  'p2h_check_items.is_critical',
  'p2h_check_items.sort_order',
  'p2h_check_items.is_active',
  'p2h_check_items.created_at',
  'p2h_check_items.created_by',
  'p2h_check_items.updated_at',
  'p2h_check_items.updated_by'
)

const list = async (db, { search, isActive, paging }) => {
  const filtered = () => {
    const q = searchColumns(base(db), search, ['p2h_check_items.code', 'p2h_check_items.label'])
    if (isActive !== undefined) q.where('p2h_check_items.is_active', isActive)
    return q
  }
  const [{ count }] = await filtered().count('p2h_check_items.code as count')
  const rows = await withAuditNames(select(filtered()), 'p2h_check_items')
    .orderBy(paging.column, paging.direction)
    .orderBy('p2h_check_items.code')
    .limit(paging.limit)
    .offset(paging.offset)
  return { rows, total: Number(count) }
}

const findByCode = (db, code) => withAuditNames(select(base(db)).where('p2h_check_items.code', code), 'p2h_check_items').first()

const insert = (db, row) => db('p2h_check_items').insert(row)

const update = (db, code, fields) => db('p2h_check_items').where({ code }).update(fields)

/** Jumlah item aktif selain `exceptCode` (P2H wajib punya minimal satu item aktif). */
const countOtherActive = async (db, exceptCode) => {
  const [{ count }] = await db('p2h_check_items').where({ is_active: true }).whereNot({ code: exceptCode }).count('code as count')
  return Number(count)
}

const nextSortOrder = async (db) => {
  const [{ max }] = await db('p2h_check_items').max('sort_order as max')
  return (max === null ? 0 : Number(max)) + 1
}

module.exports = {
  list, findByCode, insert, update, countOtherActive, nextSortOrder,
}
