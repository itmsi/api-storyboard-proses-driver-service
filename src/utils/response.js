/**
 * Envelope sukses sesuai kontrak:
 * { "success": true, "message": ..., "data": ..., "meta": ... }   // message dan meta opsional
 *
 * `meta` khusus pagination (page, limit, total, ...). Data pendamping daftar (ringkasan, hitungan per status, dan sejenisnya) tidak boleh dicampur
 * ke meta: dikirim sebagai kunci sejajar lewat opsi (mis. `{ meta, summary }` -> body.summary).
 */
const ok = (res, data = null, {
  meta, message, status = 200, ...extra
} = {}) => {
  // Urutan kunci: success, message (bila ada), data, kunci tambahan (summary dan sejenisnya), lalu meta (pagination) paling akhir
  const body = { success: true }
  if (message) body.message = message
  Object.assign(body, { data, ...extra })
  if (meta !== undefined) body.meta = meta
  return res.status(status).json(body)
}

const created = (res, data, options = {}) => ok(res, data, { ...options, status: 201 })

/**
 * Respons standar untuk proses simpan (create) dan ubah (update) di semua modul admin:
 * { "success": true, "message": "Customer berhasil dibuat.", "data": {} }
 * data bawaan kosong ({}); isi lewat opsi `data` bila memang perlu dikembalikan (mis. password awal yang dibuat sistem).
 * Detail lengkap diambil lewat endpoint GET detail masing-masing.
 */
const saved = (res, message, { data = {}, status = 200 } = {}) => ok(res, data, { status, message })

// Bungkus handler async agar error masuk ke error handler (Express 4)
const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next)

module.exports = {
  ok, created, saved, asyncHandler,
}
