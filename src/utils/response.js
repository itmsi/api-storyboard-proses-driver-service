/**
 * Envelope sukses sesuai kontrak:
 * { "success": true, "data": ..., "meta": ... }   // meta opsional
 *
 * `meta` khusus pagination (page, limit, total, ...). Data pendamping daftar (ringkasan, hitungan per status, dan sejenisnya) tidak boleh dicampur
 * ke meta: dikirim sebagai kunci sejajar lewat opsi (mis. `{ meta, summary }` -> body.summary).
 */
const ok = (res, data = null, {
  meta, status = 200, ...extra
} = {}) => {
  const body = { success: true, data }
  if (meta !== undefined) body.meta = meta
  Object.assign(body, extra)
  return res.status(status).json(body)
}

const created = (res, data, options = {}) => ok(res, data, { ...options, status: 201 })

// Bungkus handler async agar error masuk ke error handler (Express 4)
const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next)

module.exports = { ok, created, asyncHandler }
