const jwt = require('jsonwebtoken')
const config = require('../config')
const tenant = require('../database/tenant')
const { AppError } = require('../utils/errors')

/**
 * Wajib Bearer access token. Hasil decode disimpan di req.auth:
 * { sub: <user id>, role, client_code, driver_id?, device_id? }
 * dan koneksi database client-nya di req.db (dipilih dari client_code di token).
 *
 * - token kedaluwarsa  -> 401 TOKEN_EXPIRED (details.refresh = true), app panggil POST /auth/refresh
 * - token tidak valid  -> 401 UNAUTHORIZED, app kembali ke Login
 */
const authenticate = async (req, res, next) => {
  const [scheme, token] = (req.headers.authorization || '').split(' ')
  if (scheme !== 'Bearer' || !token) {
    return next(new AppError('UNAUTHORIZED'))
  }

  let payload
  try {
    payload = jwt.verify(token, config.jwt.secret, { algorithms: ['HS256'] })
    if (payload.typ !== 'access' || !payload.client_code) throw new Error('invalid token')
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return next(new AppError('TOKEN_EXPIRED', { details: { refresh: true } }))
    }
    return next(new AppError('UNAUTHORIZED'))
  }

  try {
    req.auth = payload
    req.db = await tenant.getDb(payload.client_code)
    return next()
  } catch (err) {
    // client dihapus setelah token terbit -> sesi tidak berlaku lagi
    if (err.code === 'INVALID_CLIENT_CODE') return next(new AppError('UNAUTHORIZED'))
    return next(err)
  }
}

/** Batasi endpoint untuk role tertentu, contoh: authorize('driver') */
const authorize = (...roles) => (req, res, next) => {
  if (!req.auth || !roles.includes(req.auth.role)) {
    return next(new AppError('FORBIDDEN'))
  }
  return next()
}

/** Helper untuk modul auth nanti */
const signAccessToken = (claims) => jwt.sign(
  { ...claims, typ: 'access' },
  config.jwt.secret,
  { algorithm: 'HS256', expiresIn: config.jwt.accessTokenTtl }
)

module.exports = { authenticate, authorize, signAccessToken }
