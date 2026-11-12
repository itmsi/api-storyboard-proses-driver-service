const { withAuditNames } = require('../../utils/audit')

const getProfile = (db, userId, deviceUuid) => withAuditNames(
  db('users')
    .join('drivers', 'drivers.user_id', 'users.id')
    .leftJoin('roles', 'roles.id', 'users.role_id')
    .leftJoin('devices', (j) => j.on('devices.id', '=', db.raw('?', [deviceUuid])))
    .where({ 'users.id': userId, 'users.is_delete': false, 'drivers.is_delete': false })
    .select(
      'drivers.id as driver_id',
      'drivers.code',
      'users.name',
      'users.phone',
      'users.language',
      'users.role_id',
      'roles.name as role_name',
      'roles.is_system as role_is_system',
      'roles.permissions as role_permissions',
      'devices.app_version',
      'devices.last_synced_at',
      'drivers.created_at',
      'drivers.created_by',
      'drivers.updated_at',
      'drivers.updated_by'
    ),
  'drivers'
).first()

/** Unit yang ditugaskan ke driver pada tanggal kerja tsb (unit_today). */
const getUnitForDate = (db, driverId, workDate) => db('driver_unit_assignments')
  .join('units', 'units.id', 'driver_unit_assignments.unit_id')
  .join('unit_types', 'unit_types.id', 'units.unit_type_id')
  .where({ 'driver_unit_assignments.driver_id': driverId, 'driver_unit_assignments.work_date': workDate, 'units.is_delete': false })
  .select('units.id', 'units.plate', 'unit_types.name as type')
  .first()

const updateLanguage = (db, userId, language) => db('users')
  .where({ id: userId })
  .update({ language, updated_by: userId })

module.exports = { getProfile, getUnitForDate, updateLanguage }
