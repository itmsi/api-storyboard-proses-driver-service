const { authenticate, authorize } = require('./auth')
const { AppError } = require('../utils/errors')
const permissions = require('../utils/permissions')

/**
 * Akun admin harus masih ada dan aktif SAAT INI, bukan hanya saat token diterbitkan.
 * Satu query per request admin, sebagai gantinya penonaktifan/hapus akun admin berlaku seketika
 * (access token driver tidak dicek ke DB demi kecepatan; admin jarang dan lebih sensitif).
 */
const ensureActiveAdmin = async (req, res, next) => {
  try {
    const row = await req.db('users')
      .leftJoin('roles', (j) => j.on('roles.id', 'users.role_id').andOn('roles.is_delete', req.db.raw('false')))
      .where({
        'users.id': req.auth.sub, 'users.user_type': 'admin', 'users.is_delete': false, 'users.status': 'active',
      })
      .first(
        'users.id',
        'users.username',
        'users.name',
        'users.email',
        'users.role_id',
        'roles.name as role_name',
        'roles.is_system as role_is_system',
        'roles.is_active as role_active',
        'roles.permissions as role_permissions'
      )
    if (!row) return next(new AppError('UNAUTHORIZED'))
    // Role nonaktif = akun tidak bisa dipakai; tanpa role (data lama) = tanpa hak apa pun
    if (row.role_id && row.role_active === false) {
      return next(new AppError('FORBIDDEN', { message: 'Role akun ini sedang dinonaktifkan.', details: { reason: 'role_nonaktif' } }))
    }
    const {
      role_name: roleName, role_is_system: isSystem, role_permissions: rolePermissions, role_active: roleActive, ...admin
    } = row
    req.admin = {
      ...admin,
      role: row.role_id && roleActive !== null ? { id: row.role_id, name: roleName, is_system: Boolean(isSystem) } : null,
      permissions: isSystem ? permissions.all() : (rolePermissions || {}),
    }
    return next()
  } catch (err) {
    return next(err)
  }
}

/** Dipasang di router admin: token valid + role admin + akun masih aktif. */
const adminGuard = [authenticate, authorize('admin'), ensureActiveAdmin]

/** Untuk endpoint yang dipakai driver dan admin: akun admin dicek masih aktif, driver langsung lewat. */
const activeAdminOnly = (req, res, next) => (req.auth.role === 'admin' ? ensureActiveAdmin(req, res, next) : next())

module.exports = { adminGuard, ensureActiveAdmin, activeAdminOnly }
