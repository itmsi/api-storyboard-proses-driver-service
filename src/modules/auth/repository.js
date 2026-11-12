// Semua fungsi menerima `db` = knex instance milik client (req.db / tenant.getDb).

const findDriverUser = (db, { username, phone }) => db('users')
  .join('drivers', 'drivers.user_id', 'users.id')
  .join('roles', 'roles.id', 'users.role_id')
  .where({ 'users.is_delete': false, 'drivers.is_delete': false, 'roles.user_type': 'driver' })
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

/**
 * Cari akun untuk login dari satu kolom input. Jenis akun (driver/admin) dibaca dari role akunnya (roles.user_type), bukan dari endpoint:
 *   No. HP (+62…) -> users.phone | berisi "@" -> users.email | selain itu -> users.username
 * Untuk driver ikut membawa profil kerjanya (drivers); akun yang peran/profilnya tidak lengkap tidak ditemukan.
 */
const findAccountForLogin = (db, { phone, identifier }) => db('users')
  .join('roles', 'roles.id', 'users.role_id')
  .leftJoin('drivers', (j) => j.on('drivers.user_id', 'users.id').andOn('drivers.is_delete', db.raw('false')))
  .where({ 'users.is_delete': false })
  .whereIn('roles.user_type', ['driver', 'admin'])
  .where((q) => q.whereNot('roles.user_type', 'driver').orWhereNotNull('drivers.id'))
  .modify((q) => {
    if (phone) q.where('users.phone', phone)
    else if (identifier.includes('@')) q.whereRaw('lower(users.email) = lower(?)', [identifier])
    else q.whereRaw('lower(users.username) = lower(?)', [identifier])
  })
  .select(
    'users.id',
    'roles.user_type as user_type',
    'users.username',
    'users.email',
    'users.phone',
    'users.name',
    'users.password_hash',
    'users.status as user_status',
    'users.failed_login_count',
    'users.locked_until',
    'drivers.id as driver_id',
    'drivers.code as driver_code',
    'drivers.status as driver_status'
  )
  .first()

/** Akun untuk refresh token (peran apa pun): masih ada dan, untuk driver, profil kerjanya masih ada. */
const findAccountById = (db, userId) => db('users')
  .join('roles', 'roles.id', 'users.role_id')
  .leftJoin('drivers', (j) => j.on('drivers.user_id', 'users.id').andOn('drivers.is_delete', db.raw('false')))
  .where({ 'users.id': userId, 'users.is_delete': false })
  .whereIn('roles.user_type', ['driver', 'admin'])
  .where((q) => q.whereNot('roles.user_type', 'driver').orWhereNotNull('drivers.id'))
  .select(
    'users.id',
    'roles.user_type as user_type',
    'users.name',
    'users.status as user_status',
    'drivers.id as driver_id',
    'drivers.status as driver_status'
  )
  .first()

const updatePassword = (db, id, passwordHash, actorId) => db('users')
  .where({ id })
  .update({
    password_hash: passwordHash, failed_login_count: 0, locked_until: null, updated_by: actorId,
  })

/** Cabut refresh token akun ini; `exceptFamily` = rantai sesi yang sedang dipakai (tidak ikut dicabut). */
const revokeTokens = (db, userId, exceptFamily = null) => db('refresh_tokens')
  .where({ user_id: userId })
  .whereNull('revoked_at')
  .modify((q) => { if (exceptFamily) q.whereNot({ family_id: exceptFamily }) })
  .update({ revoked_at: db.fn.now() })

/** Role hak akses sebuah akun (admin maupun driver); null jika belum punya. */
const findAccountRole = (db, userId) => db('users')
  .join('roles', 'roles.id', 'users.role_id')
  .where({ 'users.id': userId, 'roles.is_delete': false })
  .first('roles.id', 'roles.name', 'roles.is_system', 'roles.user_type', 'roles.permissions')

module.exports = {
  findAccountRole,
  findAccountForLogin,
  findAccountById,
  updatePassword,
  revokeTokens,
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
