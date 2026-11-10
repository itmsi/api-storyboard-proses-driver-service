const jwt = require('jsonwebtoken')
const config = require('../config')
const { AppError } = require('../utils/errors')

/**
 * Wajib Bearer access token. Hasil decode disimpan di req.auth:
 * { sub: <user id>, role: 'driver' | 'admin' | ..., driver_id?, device_id? }
 *
 * - token kedaluwarsa  -> 401 TOKEN_EXPIRED (details.refresh = true), app panggil POST /auth/refresh
 * - token tidak valid  -> 401 UNAUTHORIZED, app kembali ke Login
 */
const authenticate = (req, res, next) => {
  const [scheme, token] = (req.headers.authorization || '').split(' ')
  if (scheme !== 'Bearer' || !token) {
    return next(new AppError('UNAUTHORIZED'))
  }

  try {
    const payload = jwt.verify(token, config.jwt.secret, { algorithms: ['HS256'] })
    if (payload.typ !== 'access') throw new Error('wrong token type')
    req.auth = payload
    return next()
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return next(new AppError('TOKEN_EXPIRED', { details: { refresh: true } }))
    }
    return next(new AppError('UNAUTHORIZED'))
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
