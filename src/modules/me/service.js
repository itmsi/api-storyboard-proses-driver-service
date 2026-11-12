const bcrypt = require('bcrypt')
const { AppError } = require('../../utils/errors')
const { auditFields, withAuditNames } = require('../../utils/audit')
const { wibDate, toWib } = require('../../utils/date')
const password = require('../../utils/password')
const permissions = require('../../utils/permissions')
const { getPending } = require('../sync/pending')
const authRepo = require('../auth/repository')
const repo = require('./repository')

/** Profil driver (aplikasi HP): unit hari ini, bahasa, versi aplikasi, dan status sinkronisasi. */
const getDriverProfile = async (db, auth) => {
  const row = await repo.getProfile(db, auth.sub, auth.device_id)
  if (!row) throw new AppError('UNAUTHORIZED')

  const [unit, pending] = await Promise.all([repo.getUnitForDate(db, row.driver_id, wibDate()), getPending(db, auth.sub)])

  return {
    id: row.driver_id,
    code: row.code,
    name: row.name,
    phone: row.phone,
    unit_today: unit || null,
    settings: { language: row.language },
    app: { version: row.app_version },
    sync: { pending: pending.length, last_synced_at: toWib(row.last_synced_at) },
    ...auditFields(row),
  }
}

/** Profil admin (web). */
const getAdminProfile = async (db, auth) => {
  const row = await withAuditNames(
    db('users')
      .leftJoin('roles', 'roles.id', 'users.role_id')
      .where({ 'users.id': auth.sub, 'users.user_type': 'admin', 'users.is_delete': false })
      .select(
        'roles.name as role_name',
        'roles.is_system as role_is_system',
        'roles.permissions as role_permissions',
        'users.role_id',
        'users.id',
        'users.username',
        'users.email',
        'users.phone',
        'users.name',
        'users.language',
        'users.status',
        'users.last_login_at',
        'users.created_at',
        'users.created_by',
        'users.updated_at',
        'users.updated_by'
      ),
    'users'
  ).first()
  if (!row) throw new AppError('UNAUTHORIZED')
  return {
    id: row.id,
    username: row.username,
    email: row.email,
    phone: row.phone,
    name: row.name,
    settings: { language: row.language },
    status: row.status,
    // Hak akses dari role (dipakai FE untuk menyembunyikan menu); server tetap memeriksa di setiap request
    role: row.role_id ? { id: row.role_id, name: row.role_name, is_system: Boolean(row.role_is_system) } : null,
    permissions: row.role_is_system ? permissions.all() : (row.role_permissions || {}),
    last_login_at: toWib(row.last_login_at),
    ...auditFields(row),
  }
}

/** Bentuk response mengikuti peran akun yang login. */
const getMe = (db, auth) => (auth.role === 'admin' ? getAdminProfile(db, auth) : getDriverProfile(db, auth))

const updateSettings = async (db, auth, { language }) => {
  await repo.updateLanguage(db, auth.sub, language)
  return { language }
}

/** Ganti password sendiri. Sesi di perangkat lain dicabut; sesi yang sedang dipakai tetap hidup. */
const changePassword = async (db, auth, { current_password: current, new_password: next }) => {
  const row = await db('users').where({ id: auth.sub }).first('password_hash', 'is_system')
  if (row.is_system) {
    throw new AppError('FORBIDDEN', { message: 'Password akun sistem dikelola oleh MSI dan tidak bisa diubah dari sini.' })
  }
  if (!(await bcrypt.compare(current, row.password_hash))) {
    throw new AppError('VALIDATION_ERROR', { details: [{ field: 'current_password', message: 'Password saat ini salah.' }] })
  }
  if (current === next) {
    throw new AppError('VALIDATION_ERROR', { details: [{ field: 'new_password', message: 'Password baru harus berbeda dari yang lama.' }] })
  }
  await authRepo.updatePassword(db, auth.sub, await password.hash(next), auth.sub)
  await authRepo.revokeTokens(db, auth.sub, auth.fam)
  return { changed: true }
}

module.exports = { getMe, updateSettings, changePassword }
