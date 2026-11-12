const { AppError } = require('../utils/errors')
const permissions = require('../utils/permissions')

/**
 * Cek hak akses admin (dipasang SESUDAH adminGuard, yang mengisi req.admin.permissions dari role di database).
 *
 *   router.use(adminGuard)
 *   router.use(permit('drivers'))                 // aksi dari method + path (lihat inferAction)
 *   router.post('/x', adminGuard, can('units', 'update'), ...)   // aksi eksplisit
 *   router.get('/:id', anyRole, adminCan('delivery_orders', 'read'), ...)   // hanya mengecek jika yang masuk admin
 */
const READ_PATHS = new Set(['/get', '/history', '/catalog'])

/** GET dan daftar (POST /get) = read, POST / = create, PUT = update, DELETE = delete, POST tindakan lain (/:id/cancel, ...) = update. */
const inferAction = (req) => {
  if (req.method === 'GET') return 'read'
  if (req.method === 'DELETE') return 'delete'
  if (req.method === 'PUT' || req.method === 'PATCH') return 'update'
  if (READ_PATHS.has(req.path)) return 'read'
  return req.path === '/' ? 'create' : 'update'
}

/**
 * Hak akun driver: dibaca dari role di database pada setiap request (satu query), sehingga perubahan role berlaku seketika.
 * Role nonaktif = ditolak; akun tanpa role (data tidak konsisten) = tanpa hak apa pun.
 */
const fetchDriverPermissions = async (db, userId) => {
  const row = await db('users')
    .leftJoin('roles', (j) => j.on('roles.id', 'users.role_id').andOn('roles.is_delete', db.raw('false')))
    .where({ 'users.id': userId, 'users.is_delete': false })
    .first('roles.permissions as permissions', 'roles.is_active as role_active', 'roles.id as role_id')
  if (row && row.role_id && row.role_active === false) {
    throw new AppError('FORBIDDEN', { message: 'Role akun ini sedang dinonaktifkan.', details: { reason: 'role_nonaktif' } })
  }
  return (row && row.permissions) || {}
}

const loadDriverPermissions = async (req) => {
  if (!req.driverPermissions) req.driverPermissions = await fetchDriverPermissions(req.db, req.auth.sub)
  return req.driverPermissions
}

const can = (resource, action) => (req, res, next) => {
  if (permissions.can(req.admin && req.admin.permissions, resource, action)) return next()
  return next(new AppError('FORBIDDEN', {
    message: 'Anda tidak punya hak untuk tindakan ini.',
    details: { required: `${resource}:${action}` },
  }))
}

const permit = (resource) => (req, res, next) => can(resource, inferAction(req))(req, res, next)

/**
 * Hak driver untuk endpoint aplikasi HP. Hanya memeriksa bila yang masuk driver, jadi aman dipasang di route yang
 * juga dipakai admin (admin dicek terpisah lewat adminCan / permit).
 */
const driverCan = (resource, action) => async (req, res, next) => {
  if (req.auth.role !== 'driver') return next()
  try {
    const granted = await loadDriverPermissions(req)
    if (permissions.can(granted, resource, action)) return next()
    return next(new AppError('FORBIDDEN', {
      message: 'Akun Anda tidak punya hak untuk tindakan ini.',
      details: { required: `${resource}:${action}` },
    }))
  } catch (err) {
    return next(err)
  }
}

const adminCan = (resource, action) => (req, res, next) => (req.auth.role === 'admin' ? can(resource, action)(req, res, next) : next())

module.exports = {
  can, permit, adminCan, driverCan, fetchDriverPermissions, inferAction,
}
