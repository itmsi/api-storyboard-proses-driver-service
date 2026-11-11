const { withAuditNames } = require('../../utils/audit')
const { searchColumns } = require('../../utils/pagination')
const { OPEN_DO_STATUSES } = require('../../utils/master')

const base = (db) => db('customers').where({ 'customers.is_delete': false })

// location_count = jumlah lokasi aktif milik customer ini
const select = (db, query) => query.select(
  'customers.id',
  'customers.code',
  'customers.name',
  'customers.phone',
  'customers.email',
  db('locations').where('locations.customer_id', db.ref('customers.id')).where({ 'locations.is_delete': false }).count('*')
    .as('location_count'),
  'customers.created_at',
  'customers.created_by',
  'customers.updated_at',
  'customers.updated_by'
)

const list = async (db, { search, paging }) => {
  const filtered = () => searchColumns(base(db), search, ['customers.code', 'customers.name', 'customers.phone', 'customers.email'])
  const [{ count }] = await filtered().count('customers.id as count')
  const rows = await withAuditNames(select(db, filtered()), 'customers')
    .orderBy(paging.column, paging.direction)
    .orderBy('customers.id')
    .limit(paging.limit)
    .offset(paging.offset)
  return { rows, total: Number(count) }
}

const findById = (db, id) => withAuditNames(select(db, base(db)).where('customers.id', id), 'customers').first()

const codeTaken = async (db, code) => Boolean(await base(db).where({ code }).first('id'))

const insert = async (db, row) => {
  const [created] = await db('customers').insert(row).returning('id')
  return created.id
}

const update = (db, id, fields) => db('customers').where({ id }).update(fields)

const countLocations = async (db, id) => {
  const [{ count }] = await db('locations').where({ customer_id: id, is_delete: false }).count('id as count')
  return Number(count)
}

const findOpenDo = (db, id) => db('delivery_orders').where({ customer_id: id }).whereIn('status', OPEN_DO_STATUSES).first('id', 'no', 'status')

module.exports = {
  list, findById, codeTaken, insert, update, countLocations, findOpenDo,
}
