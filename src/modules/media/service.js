const crypto = require('crypto')
const sharp = require('sharp')
const storage = require('../../utils/storage')
const { AppError } = require('../../utils/errors')
const { wibDate } = require('../../utils/date')
const repo = require('./repository')

const THUMB_WIDTH = 320
const EXT = { jpeg: 'jpg', png: 'png' }
const MIME = { jpeg: 'image/jpeg', png: 'image/png' }

/**
 * Simpan satu foto. Idempoten per (user, client_ref): upload ulang mengembalikan foto yang sama.
 * Isi file diperiksa (bukan hanya header Content-Type) supaya file bukan-gambar ditolak.
 */
const upload = async (db, auth, file, body) => {
  if (!file) {
    throw new AppError('VALIDATION_ERROR', { details: [{ field: 'file', message: 'File foto wajib diisi.' }] })
  }

  const existing = await repo.findByClientRef(db, auth.sub, body.client_ref)
  if (existing) return { media: existing, created: false }

  let meta
  try {
    meta = await sharp(file.buffer).metadata()
  } catch (err) {
    throw new AppError('UNSUPPORTED_MEDIA_TYPE', { details: { reason: 'bukan file gambar yang valid' } })
  }
  if (!EXT[meta.format]) throw new AppError('UNSUPPORTED_MEDIA_TYPE', { details: { allowed: ['image/jpeg', 'image/png'] } })

  const id = crypto.randomUUID()
  const date = wibDate().replace(/-/g, '/')
  const base = `media/${auth.client_code}/${date}/${id}`
  const storageKey = `${base}.${EXT[meta.format]}`
  const thumbKey = `${base}_thumb.jpg`

  const thumb = await sharp(file.buffer).rotate().resize({ width: THUMB_WIDTH, withoutEnlargement: true }).jpeg({ quality: 70 })
    .toBuffer()
  await storage.putObject(storageKey, file.buffer, MIME[meta.format])
  await storage.putObject(thumbKey, thumb, 'image/jpeg')

  const media = await repo.insert(db, {
    id,
    kind: body.kind,
    side: body.side || null,
    storage_key: storageKey,
    thumb_key: thumbKey,
    mime_type: MIME[meta.format],
    size_bytes: file.size,
    sha256: crypto.createHash('sha256').update(file.buffer).digest('hex'),
    captured_at: body.captured_at,
    lat: body.gps ? body.gps.lat : null,
    lng: body.gps ? body.gps.lng : null,
    gps_accuracy_m: body.gps && body.gps.accuracy_m !== undefined ? body.gps.accuracy_m : null,
    captured_by: auth.sub,
    client_ref: body.client_ref,
    created_by: auth.sub,
    updated_by: auth.sub,
  })
  return { media, created: true }
}

/**
 * Pastikan foto yang dirujuk request boleh dipakai: milik driver ini, jenisnya sesuai, dan belum dipakai di tempat lain.
 * @param {string} field  nama field request untuk pesan error, mis. "cargo_photo_ids"
 * @param {string[]} kinds  jenis media yang diterima
 * @returns baris media (urutan sama dengan ids)
 */
const claim = async (db, auth, ids, kinds, field) => {
  const unique = [...new Set(ids)]
  const [rows, used] = await Promise.all([repo.findOwned(db, auth.sub, unique), repo.findInUse(db, unique)])
  const byId = new Map(rows.map((r) => [r.id, r]))
  const details = []
  ids.forEach((id, index) => {
    const path = ids.length > 1 ? `${field}.${index}` : field
    const row = byId.get(id)
    if (!row) details.push({ field: path, message: 'Foto tidak ditemukan atau bukan milik Anda.' })
    else if (!kinds.includes(row.kind)) details.push({ field: path, message: `Jenis foto harus ${kinds.join(' / ')}, bukan ${row.kind}.` })
    else if (used.has(id)) details.push({ field: path, message: 'Foto ini sudah dipakai di data lain.' })
  })
  if (ids.length !== unique.length) details.push({ field, message: 'Foto yang sama tidak boleh dikirim dua kali.' })
  if (details.length) throw new AppError('VALIDATION_ERROR', { details })
  return ids.map((id) => byId.get(id))
}

module.exports = { upload, claim }
