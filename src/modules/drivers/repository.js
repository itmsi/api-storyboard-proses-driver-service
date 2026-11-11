const { withAuditNames } = require('../../utils/audit')
const { searchColumns } = require('../../utils/pagination')

// Satu driver = baris users (login) + baris drivers (profil kerja). id yang dipakai di API = drivers.id.
const base = (db, today) => db('users')
  .join('drivers', 'drivers.user_id', 'users.id')
  .leftJoin('driver_unit_assignments as dua', (j) => j.on('dua.driver_id', 'drivers.id').andOn('dua.work_date', db.raw('?', [today])))
  .leftJoin('units as unit_today', 'unit_today.id', 'dua.unit_id')
  .where({ 'users.is_delete': false, 'drivers.is_delete': false, 'users.role': 'driver' })

const select = (db, query) => query.select(
  'drivers.id as id',
  'users.id as user_id',
  'drivers.code',
  'users.name',
  'users.phone',
  'users.status as user_status',
  db.raw('drivers.license_expires_on::text as license_expires_on'),
  'drivers.license_no',
  'drivers.license_type',
  'users.last_login_at',
  'users.failed_login_count',
  'users.locked_until',
  'unit_today.id as unit_id',
  'unit_today.plate as unit_plate',
  'drivers.created_at',
  'drivers.created_by',
  'drivers.updated_at',
  'drivers.updated_by'
)

const list = async (db, {
  today, search, status, paging,
}) => {
  const filtered = () => {
    const q = base(db, today)
    searchColumns(q, search, ['users.name', 'drivers.code', 'users.phone'])
    if (status) q.where('users.status', status)
    return q
  }
  const [{ count }] = await filtered().count('drivers.id as count')
  const rows = await withAuditNames(select(db, filtered()), 'drivers')
    .orderBy(paging.column, paging.direction)
    .orderBy('drivers.id')
    .limit(paging.limit)
    .offset(paging.offset)
  return { rows, total: Number(count) }
}

const findById = (db, today, id) => withAuditNames(select(db, base(db, today)).where('drivers.id', id), 'drivers').first()

const findActiveDo = (db, driverId) => db('delivery_orders')
  .where({ driver_id: driverId })
  .whereIn('status', ['accepted', 'loading', 'in_transit', 'handover'])
  .first('id', 'no', 'status')

/** Kode driver sudah pernah dipakai (termasuk akun yang dihapus: drivers.code unik tanpa pengecualian). */
const codeUsed = async (db, code) => Boolean(await db('drivers').where({ code }).first('id'))

const nextSequence = async (db) => {
  const { rows } = await db.raw("select nextval('driver_code_seq') as n")
  return Number(rows[0].n)
}

const insertDriver = async (trx, user, driver) => {
  const [createdUser] = await trx('users').insert(user).returning('id')
  const [createdDriver] = await trx('drivers').insert({ ...driver, user_id: createdUser.id }).returning('id')
  return createdDriver.id
}

const updateUser = (trx, userId, fields) => trx('users').where({ id: userId }).update(fields)

const updateDriver = (trx, driverId, fields) => trx('drivers').where({ id: driverId }).update(fields)

const softDelete = async (trx, row, actorId) => {
  const gone = {
    is_delete: true, deleted_at: trx.fn.now(), deleted_by: actorId, updated_by: actorId,
  }
  await trx('users').where({ id: row.user_id }).update(gone)
  await trx('drivers').where({ id: row.id }).update(gone)
}

module.exports = {
  list, findById, findActiveDo, codeUsed, nextSequence, insertDriver, updateUser, updateDriver, softDelete,
}
