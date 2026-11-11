const { withAuditNames } = require('../../utils/audit')
const { searchColumns } = require('../../utils/pagination')

const base = (db) => db('unit_types').where({ 'unit_types.is_delete': false })

// unit_count = jumlah unit aktif bertipe ini (membantu admin sebelum menghapus)
const select = (db, query) => query.select(
  'unit_types.id',
  'unit_types.code',
  'unit_types.name',
  'unit_types.max_load_kg',
  db('units').where('units.unit_type_id', db.ref('unit_types.id')).where({ 'units.is_delete': false }).count('*')
    .as('unit_count'),
  'unit_types.created_at',
  'unit_types.created_by',
  'unit_types.updated_at',
  'unit_types.updated_by'
)

const list = async (db, { search, paging }) => {
  const filtered = () => searchColumns(base(db), search, ['unit_types.code', 'unit_types.name'])
  const [{ count }] = await filtered().count('unit_types.id as count')
  const rows = await withAuditNames(select(db, filtered()), 'unit_types')
    .orderBy(paging.column, paging.direction)
    .orderBy('unit_types.id')
    .limit(paging.limit)
    .offset(paging.offset)
  return { rows, total: Number(count) }
}

const findById = (db, id) => withAuditNames(select(db, base(db)).where('unit_types.id', id), 'unit_types').first()

const codeTaken = async (db, code) => Boolean(await base(db).where({ code }).first('id'))

const insert = async (db, row) => {
  const [created] = await db('unit_types').insert(row).returning('id')
  return created.id
}

const update = (db, id, fields) => db('unit_types').where({ id }).update(fields)

const countUnits = async (db, id) => {
  const [{ count }] = await db('units').where({ unit_type_id: id, is_delete: false }).count('id as count')
  return Number(count)
}

module.exports = {
  list, findById, codeTaken, insert, update, countUnits,
}
