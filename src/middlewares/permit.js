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

const can = (resource, action) => (req, res, next) => {
  if (permissions.can(req.admin && req.admin.permissions, resource, action)) return next()
  return next(new AppError('FORBIDDEN', {
    message: 'Anda tidak punya hak untuk tindakan ini.',
    details: { required: `${resource}:${action}` },
  }))
}

const permit = (resource) => (req, res, next) => can(resource, inferAction(req))(req, res, next)

const adminCan = (resource, action) => (req, res, next) => (req.auth.role === 'admin' ? can(resource, action)(req, res, next) : next())

module.exports = {
  can, permit, adminCan, inferAction,
}
