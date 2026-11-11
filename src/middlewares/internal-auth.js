const crypto = require('crypto')
const config = require('../config')
const { AppError } = require('../utils/errors')

const digest = (value) => crypto.createHash('sha256').update(String(value)).digest()

/**
 * Autentikasi antar-layanan untuk /internal/*: header `X-Internal-Key` harus sama dengan INTERNAL_PROVISIONING_KEY
 * (kunci saas-worker; kunci ini juga yang dipakai API ini untuk meminta kredensial provisioning ke saas-api).
 * - Kunci kosong -> endpoint dianggap tidak ada (404), supaya tidak terbuka tanpa sengaja.
 * - Dibandingkan lewat hash + timingSafeEqual (tidak bocor lewat waktu respons).
 */
const internalAuth = (req, res, next) => {
  const expected = config.internal.provisioningKey
  if (!expected) return next(new AppError('ROUTE_NOT_FOUND', { details: { method: req.method, path: req.originalUrl } }))

  const provided = req.headers['x-internal-key']
  if (!provided || !crypto.timingSafeEqual(digest(provided), digest(expected))) {
    return next(new AppError('UNAUTHORIZED'))
  }
  return next()
}

module.exports = { internalAuth }
