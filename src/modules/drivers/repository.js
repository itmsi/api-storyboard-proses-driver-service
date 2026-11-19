const { withAuditNames } = require('../../utils/audit')
const { searchColumns } = require('../../utils/pagination')
const { applyExpiry } = require('../../utils/expiry')
const { holdsOnDateSql, doWorkDateSql } = require('../../utils/master')

// Satu driver = baris users (login) + baris drivers (profil kerja). id yang dipakai di API = drivers.id.
const base = (db, today) => db('users')
  .join('drivers', 'drivers.user_id', 'users.id')
  .leftJoin('roles', 'roles.id', 'users.role_id')
  // Unit bawaan driver ini (units.driver_id)
  .leftJoin('units as default_unit', (j) => j.on('default_unit.driver_id', 'drivers.id').andOn('default_unit.is_delete', db.raw('false')))
  // Unit hari ini: dari DO driver pada tanggal itu (unit pengganti menang); selain itu unit bawaan, kecuali dipegang driver lain lewat DO hari itu
  .joinRaw(`LEFT JOIN units AS unit_today ON unit_today.id = COALESCE(
    (SELECT o.unit_id FROM delivery_orders AS o
      WHERE o.driver_id = drivers.id AND ${holdsOnDateSql('o', '?::date')}
      ORDER BY (${doWorkDateSql('o')} = ?::date) DESC, o.created_at LIMIT 1),
    (CASE WHEN default_unit.id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM delivery_orders AS other
      WHERE other.unit_id = default_unit.id AND other.driver_id <> drivers.id AND ${holdsOnDateSql('other', '?::date')}
    ) THEN default_unit.id END))`, [today, today, today, today, today])
  .where({ 'users.is_delete': false, 'drivers.is_delete': false, 'roles.user_type': 'driver' })

const select = (db, query) => query.select(
  'drivers.id as id',
  'users.id as user_id',
  'drivers.code',
  'users.name',
  'users.phone',
  'users.status as user_status',
  'users.role_id',
  'roles.name as role_name',
  db.raw('drivers.license_expires_on::text as license_expires_on'),
  'drivers.license_no',
  'drivers.license_type',
  'users.last_login_at',
  'users.failed_login_count',
  'users.locked_until',
  'unit_today.id as unit_id',
  'unit_today.plate as unit_plate',
  'default_unit.id as default_unit_id',
  'default_unit.plate as default_unit_plate',
  'default_unit.driver_assigned_at as default_unit_since',
  'drivers.created_at',
  'drivers.created_by',
  'drivers.updated_at',
  'drivers.updated_by'
)

const list = async (db, {
  today, search, status, roleId, licenseType, licenseStatus, hasUnit, dates, paging,
}) => {
  const filtered = () => {
    const q = base(db, today)
    searchColumns(q, search, ['users.name', 'drivers.code', 'users.phone'])
    if (status) q.where('users.status', status)
    if (roleId) q.where('users.role_id', roleId)
    if (licenseType) q.whereRaw('lower(drivers.license_type) = ?', [licenseType.toLowerCase()])
    if (hasUnit === true) q.whereNotNull('default_unit.id')
    if (hasUnit === false) q.whereNull('default_unit.id')
    applyExpiry(q, 'drivers.license_expires_on', licenseStatus, dates)
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

/** Role driver (jenis akun driver) yang ada; tanpa id = role bawaan Driver. */
const findDriverRole = (db, roleId) => {
  const q = db('roles').where({ user_type: 'driver', is_delete: false })
  if (roleId) q.where({ id: roleId })
  else q.where({ is_system: true })
  return q.first('id', 'name', 'is_active')
}

const findActiveDo = (db, driverId) => db('delivery_orders')
  .where({ driver_id: driverId })
  .whereIn('status', ['accepted', 'loading', 'in_transit', 'handover'])
  .first('id', 'no', 'status')

/** Jumlah DO yang sudah selesai (semua hasil) untuk satu driver. */
const completedOrders = async (db, driverId) => {
  const [{ count }] = await db('delivery_orders').where({ driver_id: driverId, status: 'completed' }).count('id as count')
  return Number(count)
}

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
  // Driver dihapus: tidak lagi jadi driver bawaan unit mana pun
  await trx('units').where({ driver_id: row.id }).update({ driver_id: null, updated_by: actorId })
}

module.exports = {
  findDriverRole,
  list,
  findById,
  findActiveDo,
  completedOrders,
  codeUsed,
  nextSequence,
  insertDriver,
  updateUser,
  updateDriver,
  softDelete,
}
