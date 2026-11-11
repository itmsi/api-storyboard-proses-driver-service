const { withAuditNames } = require('../../utils/audit')
const { searchColumns } = require('../../utils/pagination')

const base = (db) => db('roles').where('roles.is_delete', false)

// user_count = akun admin (bukan akun sistem) yang memakai role ini
const select = (db, query) => query.select(
  'roles.id',
  'roles.code',
  'roles.name',
  'roles.description',
  'roles.permissions',
  'roles.is_system',
  'roles.is_active',
  db('users').where({ 'users.is_delete': false, 'users.is_system': false }).where('users.role_id', db.ref('roles.id')).count('*')
    .as('user_count'),
  'roles.created_at',
  'roles.created_by',
  'roles.updated_at',
  'roles.updated_by'
)

const list = async (db, { search, isActive, paging }) => {
  const filtered = () => {
    const q = searchColumns(base(db), search, ['roles.name', 'roles.code'])
    if (isActive !== undefined) q.where('roles.is_active', isActive)
    return q
  }
  const [{ count }] = await filtered().count('roles.id as count')
  const rows = await withAuditNames(select(db, filtered()), 'roles')
    .orderBy(paging.column, paging.direction)
    .orderBy('roles.id')
    .limit(paging.limit)
    .offset(paging.offset)
  return { rows, total: Number(count) }
}

const findById = (db, id) => withAuditNames(select(db, base(db)).where('roles.id', id), 'roles').first()

const findByCodeOrName = (db, { code, name }, exceptId) => {
  const q = base(db).where((w) => w.whereRaw('lower(roles.code) = lower(?)', [code]).orWhereRaw('lower(roles.name) = lower(?)', [name]))
  if (exceptId) q.whereNot('roles.id', exceptId)
  return q.first('roles.id', 'roles.code', 'roles.name')
}

const insert = async (db, row) => {
  const [created] = await db('roles').insert(row).returning('id')
  return created.id
}

const update = (db, id, fields) => db('roles').where({ id }).update(fields)

const softDelete = (db, id, actorId) => db('roles').where({ id }).update({
  is_delete: true, deleted_at: db.fn.now(), deleted_by: actorId, updated_by: actorId,
})

/** Semua akun (termasuk akun sistem) yang masih memakai role ini. */
const countUsers = async (db, id) => {
  const [{ count }] = await db('users').where({ role_id: id, is_delete: false }).count('id as count')
  return Number(count)
}

const findAdministrator = (db) => db('roles').where({ is_system: true, is_delete: false }).first('id', 'name')

module.exports = {
  list, findById, findByCodeOrName, insert, update, softDelete, countUsers, findAdministrator,
}
