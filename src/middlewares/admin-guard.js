const { authenticate, authorize } = require('./auth')
const { AppError } = require('../utils/errors')

/**
 * Akun admin harus masih ada dan aktif SAAT INI, bukan hanya saat token diterbitkan.
 * Satu query per request admin, sebagai gantinya penonaktifan/hapus akun admin berlaku seketika
 * (access token driver tidak dicek ke DB demi kecepatan; admin jarang dan lebih sensitif).
 */
const ensureActiveAdmin = async (req, res, next) => {
  try {
    const admin = await req.db('users')
      .where({
        id: req.auth.sub, role: 'admin', is_delete: false, status: 'active'
      })
      .first('id', 'username', 'name', 'email')
    if (!admin) return next(new AppError('UNAUTHORIZED'))
    req.admin = admin
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
