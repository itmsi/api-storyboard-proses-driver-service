// Semua fungsi menerima `db` = knex instance milik client (req.db / tenant.getDb).

const findDriverUser = (db, { username, phone }) => db('users')
  .join('drivers', 'drivers.user_id', 'users.id')
  .where({ 'users.is_delete': false, 'drivers.is_delete': false, 'users.role': 'driver' })
  .modify((q) => {
    if (phone) q.where('users.phone', phone)
    else q.whereRaw('lower(users.username) = lower(?)', [username])
  })
  .select(
    'users.id',
    'users.username',
    'users.phone',
    'users.name',
    'users.password_hash',
    'users.language',
    'users.status as user_status',
    'users.failed_login_count',
    'users.locked_until',
    'drivers.id as driver_id',
    'drivers.code as driver_code',
    'drivers.status as driver_status'
  )
  .first()

const findDriverUserById = (db, userId) => db('users')
  .join('drivers', 'drivers.user_id', 'users.id')
  .where({ 'users.id': userId, 'users.is_delete': false, 'drivers.is_delete': false })
  .select(
    'users.id',
    'users.name',
    'users.phone',
    'users.status as user_status',
    'drivers.id as driver_id',
    'drivers.code as driver_code',
    'drivers.status as driver_status'
  )
  .first()

/** Tambah hitungan gagal secara atomik (aman untuk request bersamaan), kembalikan hitungan baru. */
const incrementFailedLogin = async (db, userId) => {
  const [row] = await db('users')
    .where({ id: userId })
    .update({ failed_login_count: db.raw('failed_login_count + 1') })
    .returning('failed_login_count')
  return row.failed_login_count
}

const lockUser = (db, userId, until) => db('users')
  .where({ id: userId })
  .update({ locked_until: until, failed_login_count: 0 })

const markLoginSuccess = (db, userId) => db('users')
  .where({ id: userId })
  .update({ failed_login_count: 0, locked_until: null, last_login_at: db.fn.now() })

/** Satu baris per (user, device_id). Mengembalikan baris device (id uuid dipakai di token). */
const upsertDevice = async (db, userId, device) => {
  const [row] = await db('devices')
    .insert({
      user_id: userId,
      device_id: device.device_id,
      os_version: device.os || null,
      app_version: device.app_version || null,
      last_seen_at: db.fn.now(),
      created_by: userId,
      updated_by: userId,
    })
    .onConflict(['user_id', 'device_id'])
    .merge({
      os_version: db.raw('COALESCE(excluded.os_version, devices.os_version)'),
      app_version: db.raw('COALESCE(excluded.app_version, devices.app_version)'),
      last_seen_at: db.fn.now(),
      updated_by: userId,
    })
    .returning(['id', 'device_id'])
  return row
}

const insertRefreshToken = (db, row) => db('refresh_tokens').insert(row).returning('id')

const findRefreshTokenByHash = (db, hash) => db('refresh_tokens').where({ token_hash: hash }).first()

const revokeRefreshToken = (db, id, replacedBy = null) => db('refresh_tokens')
  .where({ id })
  .update({ revoked_at: db.fn.now(), replaced_by: replacedBy })

const revokeFamily = (db, familyId) => db('refresh_tokens')
  .where({ family_id: familyId })
  .whereNull('revoked_at')
  .update({ revoked_at: db.fn.now() })

const revokeDeviceTokens = (db, userId, deviceUuid) => db('refresh_tokens')
  .where({ user_id: userId, device_id: deviceUuid })
  .whereNull('revoked_at')
  .update({ revoked_at: db.fn.now() })

const clearFcmToken = (db, userId, deviceUuid) => db('devices')
  .where({ id: deviceUuid, user_id: userId })
  .update({ fcm_token: null, updated_by: userId })

module.exports = {
  findDriverUser,
  findDriverUserById,
  incrementFailedLogin,
  lockUser,
  markLoginSuccess,
  upsertDevice,
  insertRefreshToken,
  findRefreshTokenByHash,
  revokeRefreshToken,
  revokeFamily,
  revokeDeviceTokens,
  clearFcmToken,
}
