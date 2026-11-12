const { Readable } = require('stream')
const config = require('../config')
const storage = require('../utils/storage')

/**
 * Menyajikan media dari Nextcloud di /storage/<key> (STORAGE_DRIVER=nextcloud). Kredensial Nextcloud hanya ada di server;
 * aplikasi cukup memakai URL /storage seperti pada driver lain. Key berisi UUID sehingga tidak bisa ditebak.
 * Hanya path media/... yang dikenal yang diteruskan (tanpa ".."), selain itu jatuh ke 404 biasa.
 */
const KEY_PATTERN = /^media\/[A-Za-z0-9_-]+(\/[A-Za-z0-9_.-]+)+$/

const storageProxy = async (req, res, next) => {
  if (config.storage.driver !== 'nextcloud' || (req.method !== 'GET' && req.method !== 'HEAD')) return next()

  let key
  try {
    key = decodeURIComponent(req.path.replace(/^\//, ''))
  } catch (err) {
    return next()
  }
  if (!KEY_PATTERN.test(key) || key.includes('..')) return next()

  try {
    const file = await storage.getNextcloud(key)
    if (!file) return next()
    res.set('Content-Type', file.contentType)
    res.set('Cache-Control', 'public, max-age=604800, immutable')
    if (file.contentLength) res.set('Content-Length', file.contentLength)
    if (req.method === 'HEAD') return res.end()
    const stream = Readable.fromWeb(file.body)
    stream.on('error', () => res.destroy())
    return stream.pipe(res)
  } catch (err) {
    return next(err)
  }
}

module.exports = { storageProxy }
