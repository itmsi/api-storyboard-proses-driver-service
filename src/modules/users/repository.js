const { withAuditNames } = require('../../utils/audit')
const { searchColumns } = require('../../utils/pagination')

// Akun sistem MSI (is_system) sengaja tidak termasuk: tidak tampil, tidak bisa diubah/dihapus, dan tidak dihitung sebagai admin perusahaan
const base = (db) => db('users')
  .leftJoin('roles', 'roles.id', 'users.role_id')
  .where({ 'users.role': 'admin', 'users.is_delete': false, 'users.is_system': false })

const SELECT = [
  'users.id',
  'users.username',
  'users.email',
  'users.phone',
  'users.name',
  'users.status',
  'users.role_id',
  'roles.name as role_name',
  'roles.is_system as role_is_system',
  'users.last_login_at',
  'users.failed_login_count',
  'users.locked_until',
  'users.created_at',
  'users.created_by',
  'users.updated_at',
  'users.updated_by',
]

const list = async (db, {
  search, status, roleId, paging,
}) => {
  const filtered = () => {
    const q = base(db)
    searchColumns(q, search, ['users.name', 'users.username', 'users.email'])
    if (status) q.where('users.status', status)
    if (roleId) q.where('users.role_id', roleId)
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

/** Jumlah akun Administrator (role bawaan) yang AKTIF selain `exceptId`: perusahaan tidak boleh kehilangan pengelola terakhirnya. */
const countOtherActiveAdministrators = async (db, exceptId) => {
  const [{ count }] = await base(db).where({ 'users.status': 'active', 'roles.is_system': true }).whereNot('users.id', exceptId)
    .count('users.id as count')
  return Number(count)
}

const ROLE_COLUMNS = ['id', 'name', 'is_system', 'is_active', 'permissions']

const findRole = (db, roleId) => db('roles').where({ id: roleId, is_delete: false }).first(ROLE_COLUMNS)

const findAdministratorRole = (db) => db('roles').where({ is_system: true, is_delete: false }).first(ROLE_COLUMNS)

const insert = async (db, row) => {
  const [created] = await db('users').insert(row).returning('id')
  return created.id
}

const update = (db, id, fields) => db('users').where({ id }).update(fields)

const softDelete = (db, id, actorId) => db('users').where({ id }).update({
  is_delete: true, deleted_at: db.fn.now(), deleted_by: actorId, updated_by: actorId,
})

module.exports = {
  list, findById, countOtherActive, countOtherActiveAdministrators, findRole, findAdministratorRole, insert, update, softDelete,
}
