const { withAuditNames } = require('../../utils/audit')
const { searchColumns } = require('../../utils/pagination')

const base = (db) => db('users').where({ 'users.role': 'admin', 'users.is_delete': false })

const SELECT = [
  'users.id',
  'users.username',
  'users.email',
  'users.phone',
  'users.name',
  'users.status',
  'users.last_login_at',
  'users.failed_login_count',
  'users.locked_until',
  'users.created_at',
  'users.created_by',
  'users.updated_at',
  'users.updated_by',
]

const list = async (db, { search, status, paging }) => {
  const filtered = () => {
    const q = base(db)
    searchColumns(q, search, ['users.name', 'users.username', 'users.email'])
    if (status) q.where('users.status', status)
    return q
  }
  const [{ count }] = await filtered().count('users.id as count')
  const rows = await withAuditNames(filtered().select(SELECT), 'users')
    .orderBy(paging.column, paging.direction)
    .orderBy('users.id')
    .limit(paging.limit)
    .offset(paging.offset)
  return { rows, total: Number(count) }
}

const findById = (db, id) => withAuditNames(base(db).where('users.id', id).select(SELECT), 'users').first()

/** Jumlah admin AKTIF selain `exceptId` (menjaga agar selalu tersisa minimal satu admin aktif). */
const countOtherActive = async (db, exceptId) => {
  const [{ count }] = await base(db).where({ 'users.status': 'active' }).whereNot('users.id', exceptId).count('users.id as count')
  return Number(count)
}

const insert = async (db, row) => {
  const [created] = await db('users').insert(row).returning('id')
  return created.id
}

const update = (db, id, fields) => db('users').where({ id }).update(fields)

const softDelete = (db, id, actorId) => db('users').where({ id }).update({
  is_delete: true, deleted_at: db.fn.now(), deleted_by: actorId, updated_by: actorId,
})

module.exports = {
  list, findById, countOtherActive, insert, update, softDelete,
}
