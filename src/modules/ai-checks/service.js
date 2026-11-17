const config = require('../../config')
const { AppError } = require('../../utils/errors')
const { toWib } = require('../../utils/date')
const queue = require('../../utils/ai-queue')
const { readerKindForMedia } = require('../../utils/ai-readers')
const aiSettings = require('../settings/ai')
const repo = require('./repository')

// Pengecekan foto dengan AI atas permintaan FE (docs/PLAN-OCR.md). Hasil AI hanya pembanding: tidak mengubah nilai bacaan (effective_*).
// Modul ini menerbitkan pekerjaan ke antrean dan membacakan statusnya; pembacaan oleh AI dilakukan worker.

const HOUR_MS = 60 * 60 * 1000

const serialize = (row) => ({
  id: row.id,
  media_id: row.media_id,
  kind: row.kind,
  status: row.status,
  attempts: row.attempts,
  // Hasil hanya muncul bila selesai. raw dan usage tidak diberikan ke klien.
  result: row.status === 'done' ? row.result : null,
  confidence: row.status === 'done' && row.confidence !== null ? Number(row.confidence) : null,
  model: row.status === 'done' ? row.model : null,
  error: row.status === 'failed' ? { code: row.error_code, message: row.error_message } : null,
  requested_at: toWib(row.created_at),
  finished_at: toWib(row.finished_at),
})

const notFound = (field, id) => new AppError('NOT_FOUND', { details: { [field]: id } })

const invalid = (message) => new AppError('VALIDATION_ERROR', { details: [{ field: 'id', message }] })

/**
 * FE meminta pengecekan AI untuk satu foto miliknya.
 * Idempoten per foto: yang sudah antre/diproses/selesai dikembalikan apa adanya; yang gagal diantrekan ulang.
 *
 * @returns {Promise<{ check: object, queued: boolean }>}  queued = pekerjaan baru diterbitkan ke antrean (bukan hasil yang sudah ada)
 */
const request = async (db, auth, mediaId, { regenerate = false } = {}) => {
  if (!config.ai.enabled) {
    throw new AppError('INVALID_STATE', { message: 'Pengecekan AI sedang tidak aktif.', details: { reason: 'ai_nonaktif' } })
  }

  // Driver: hanya foto miliknya. Admin: foto mana pun yang belum dihapus.
  let media
  if (auth.role === 'admin') {
    media = await repo.findMedia(db, mediaId)
    if (media && media.is_delete) media = null
  } else {
    media = await repo.findOwnedMedia(db, auth.sub, mediaId)
  }
  if (!media) throw notFound('media_id', mediaId)
  const kind = readerKindForMedia(media.kind)
  if (!kind) throw invalid(`Foto jenis ${media.kind} tidak dibaca AI (hanya foto odometer dan struk BBM).`)

  const existing = await repo.findByMedia(db, mediaId)
  // Yang gagal selalu boleh diantrekan ulang; yang selesai hanya bila regenerate. Yang sedang antre/berjalan tidak digandakan.
  const reusable = existing && existing.status !== 'failed' && !(regenerate && existing.status === 'done')
  if (reusable) {
    // Pekerjaan yang tak bergerak lama (pesan hilang, worker mati): terbitkan ulang. Worker melewati pesan ganda.
    const age = Date.now() - new Date(existing.updated_at).getTime()
    // Pekerjaan baru yang belum pernah diambil worker cepat dicurigai (pesannya tidak sampai, mis. antrean belum terpasang saat dibuat);
    // yang sudah pernah dicoba menunggu antrean tunda sehingga diberi batas lebih longgar
    const fresh = existing.status === 'queued' && existing.attempts === 0
    const stuck = fresh ? age > config.ai.queue.staleQueuedMs : (existing.status === 'queued' || existing.status === 'processing') && age > config.ai.queue.staleMs
    if (stuck && (await queue.publish({ client_code: auth.client_code, ai_check_id: existing.id }))) await repo.touch(db, existing.id)
    return { check: existing, queued: false }
  }

  if (!(await aiSettings.getApiKey(db))) {
    throw new AppError('INVALID_STATE', {
      message: 'API key OpenAI untuk client ini belum diisi. Hubungi admin.',
      details: { reason: 'api_key_belum_diisi' },
    })
  }
  if ((await repo.countRequestedSince(db, auth.sub, new Date(Date.now() - HOUR_MS))) >= config.ai.maxChecksPerHour) {
    throw new AppError('RATE_LIMITED', {
      message: 'Terlalu banyak permintaan pengecekan AI. Coba lagi nanti.',
      details: { reason: 'batas_per_jam', limit: config.ai.maxChecksPerHour },
    })
  }

  let check
  if (existing) {
    check = await repo.requeue(db, existing.id, auth.sub, regenerate ? ['failed', 'done'] : ['failed'])
  } else {
    try {
      check = await repo.insert(db, {
        media_id: mediaId, kind, requested_by: auth.sub, created_by: auth.sub, updated_by: auth.sub,
      })
    } catch (err) {
      // Permintaan yang sama masuk bersamaan: pakai baris yang sudah dibuat lebih dulu
      if (err.code === '23505') return { check: await repo.findByMedia(db, mediaId), queued: false }
      throw err
    }
  }
  if (!check) return { check: await repo.findByMedia(db, mediaId), queued: false } // status berubah di antara dua query

  await queue.publish({ client_code: auth.client_code, ai_check_id: check.id })
  return { check, queued: true }
}

/** Status/hasil satu pengecekan. Driver hanya atas fotonya sendiri; admin (hak media:read) semuanya. */
const get = async (db, auth, id) => {
  const row = await repo.findById(db, id)
  if (!row) throw notFound('ai_check_id', id)
  if (auth.role === 'driver') {
    // Driver membaca pengecekan atas fotonya sendiri, juga bila admin yang meminta ulang
    const owner = await repo.findMediaOwner(db, row.media_id)
    if (!owner || owner.captured_by !== auth.sub) throw notFound('ai_check_id', id)
  }
  return serialize(row)
}

module.exports = { request, get, serialize }
