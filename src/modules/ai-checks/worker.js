const config = require('../../config')
const logger = require('../../utils/logger')
const tenant = require('../../database/tenant')
const queue = require('../../utils/ai-queue')
const { AiError } = require('../../utils/ai-error')
const { loadImageForAi } = require('../../utils/ai-image')
const { read } = require('../../utils/ai-readers')
const aiSettings = require('../settings/ai')
const repo = require('./repository')
const attach = require('./attach')

// Worker pengecekan AI (docs/PLAN-OCR.md langkah 5): memproses satu pesan { client_code, ai_check_id }.
//   1. pilih database client, ambil pekerjaan (hanya yang masih queued/processing: pesan ganda dan pekerjaan selesai dilewati)
//   2. ambil foto dari penyimpanan, baca dengan OpenAI memakai API key client itu
//   3. sukses: simpan hasil (done). Gagal sementara: kembali queued + dijadwalkan ulang ke antrean tunda, sampai batas percobaan.
//      Gagal permanen (key ditolak, foto hilang, model menolak): failed.
// Hasil AI tidak pernah mengubah nilai bacaan; setelah tersimpan, hasilnya ditempelkan ke bacaan odometer/biaya yang memakai foto itu (attach.js).

/** Jeda percobaan ulang ke-n (n mulai 1); bila OpenAI meminta jeda tertentu, ambil jeda tersedia terdekat yang cukup. */
const pickDelay = (attempt, retryAfterMs, delays = config.ai.queue.retryDelaysMs) => {
  if (!delays.length) return 0
  if (retryAfterMs) return delays.find((d) => d >= retryAfterMs) || delays[delays.length - 1]
  return delays[Math.min(attempt - 1, delays.length - 1)]
}

const describe = (err) => {
  if (err instanceof AiError) return { code: err.code, message: err.message, retryable: err.retryable }
  // Kesalahan tak terduga (database, bug): dicatat lengkap di log, tetapi pesan ke pengguna dibuat generik
  logger.error(`Pengecekan AI: kesalahan tak terduga: ${err && err.stack ? err.stack : err}`)
  return { code: 'internal', message: 'Terjadi kesalahan internal saat membaca foto.', retryable: true }
}

/**
 * @param {{ client_code: string, ai_check_id: string }} message
 * @param {object} [deps]
 * @param {Function} [deps.getDb]  (clientCode) => knex
 * @param {Function} [deps.onDone] (db, check) => Promise: dipanggil setelah hasil tersimpan; bawaan menempelkan ke bacaan odometer/biaya (attach.js)
 * @returns {Promise<{ outcome: 'done'|'retry'|'failed'|'skipped', delayMs?: number, reason?: string }>}
 */
const processCheck = async (message, { getDb = tenant.getDb, onDone = attach.onCheckDone, maxAttempts = config.ai.queue.maxAttempts } = {}) => {
  const { client_code: clientCode, ai_check_id: id } = message || {}
  if (!clientCode || !id) return { outcome: 'skipped', reason: 'pesan_tidak_lengkap' }

  let db
  try {
    db = await getDb(clientCode)
  } catch (err) {
    // Client tidak dikenal/nonaktif: pesan tidak berguna. Database client sedang tak terjangkau: coba lagi nanti.
    if (err.code === 'TENANT_UNAVAILABLE') {
      logger.warn(`Pengecekan AI ${id}: database client ${clientCode} belum terjangkau; dijadwalkan ulang`)
      return { outcome: 'retry', delayMs: pickDelay(1), reason: 'tenant_tidak_terjangkau' }
    }
    logger.warn(`Pengecekan AI ${id}: client ${clientCode} dilewati (${err.code || err.message})`)
    return { outcome: 'skipped', reason: 'client_tidak_aktif' }
  }

  const check = await repo.claim(db, id)
  if (!check) return { outcome: 'skipped', reason: 'bukan_giliran' } // tidak ada, sudah selesai, atau gagal permanen

  try {
    const apiKey = await aiSettings.getApiKey(db)
    if (!apiKey) throw new AiError('ai_not_configured', { message: 'API key OpenAI untuk client ini belum diisi.' })
    const media = await repo.findMedia(db, check.media_id)
    if (!media || media.is_delete) throw new AiError('ai_image_missing', { message: 'Foto tidak ditemukan.' })

    const image = await loadImageForAi(media.storage_key)
    const out = await read(check.kind, { apiKey, image })
    await repo.finish(db, id, {
      result: out.result, raw: out.raw, confidence: out.result.confidence, model: out.model, usage: out.usage,
    })
    if (onDone) {
      try {
        await onDone(db, { ...check, status: 'done', result: out.result })
      } catch (err) {
        // Hasil sudah tersimpan; kegagalan menempelkannya tidak boleh mengulang pembacaan (dan biaya OpenAI)
        logger.error(`Pengecekan AI ${id}: gagal menempelkan hasil ke bacaan: ${err.message}`)
      }
    }
    return { outcome: 'done' }
  } catch (err) {
    const info = describe(err)
    if (info.retryable && check.attempts < maxAttempts) {
      await repo.markRetry(db, id, info)
      return { outcome: 'retry', delayMs: pickDelay(check.attempts, err.retryAfterMs), reason: info.code }
    }
    await repo.markFailed(db, id, info)
    return { outcome: 'failed', reason: info.code }
  }
}

/** Penangan pesan untuk transport: percobaan ulang dijadwalkan ke antrean tunda; sisanya selesai (ack). */
const createHandler = (transport, deps) => async (message) => {
  const result = await processCheck(message, deps)
  logger.info(`Pengecekan AI ${message && message.ai_check_id}: ${result.outcome}${result.reason ? ` (${result.reason})` : ''}${result.delayMs ? `, coba lagi ${Math.round(result.delayMs / 1000)} detik` : ''}`)
  if (result.outcome === 'retry') await transport.publishRetry(message, result.delayMs)
  return result
}

/**
 * Terbitkan ulang pekerjaan yang tersangkut (pesan hilang saat broker mati, atau worker mati saat memproses), untuk tenant yang
 * bisa didaftar (mode registry env; mode remote tidak punya daftar, dan di sana jalur pemulihannya adalah permintaan ulang oleh FE).
 * Aman diulang: pesan ganda dilewati worker.
 */
const sweepPending = async ({
  getDb = tenant.getDb, listCodes = tenant.listCodes, publish = queue.publish, staleMs = config.ai.queue.staleMs,
} = {}) => {
  let codes
  try {
    codes = await listCodes()
  } catch (err) {
    return 0 // registry tanpa daftar tenant
  }
  let count = 0
  // eslint-disable-next-line no-restricted-syntax
  for (const code of codes) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const db = await getDb(code)
      // eslint-disable-next-line no-await-in-loop
      const stale = await repo.findStale(db, new Date(Date.now() - staleMs))
      // eslint-disable-next-line no-restricted-syntax
      for (const row of stale) {
        // eslint-disable-next-line no-await-in-loop
        if (await publish({ client_code: code, ai_check_id: row.id })) {
          // eslint-disable-next-line no-await-in-loop
          await repo.touch(db, row.id)
          count += 1
        }
      }
    } catch (err) {
      logger.warn(`Sapuan pengecekan AI untuk ${code} dilewati: ${err.code || err.message}`)
    }
  }
  if (count) logger.info(`Sapuan pengecekan AI: ${count} pekerjaan tersangkut diterbitkan ulang`)
  return count
}

module.exports = {
  processCheck, createHandler, sweepPending, pickDelay,
}
