const config = require('../../config')
const logger = require('../../utils/logger')
const { encrypt, decrypt } = require('../../utils/tenant-crypto')
const { withAuditNames, auditFields } = require('../../utils/audit')
const { checkApiKey } = require('../../utils/vision')
const { AiError } = require('../../utils/ai-error')
const appRepo = require('../app/repository')

// API key OpenAI per client (satu key per client). Disimpan terenkripsi (AES-256-GCM, kunci yang sama dengan sandi DB tenant:
// TENANT_DB_ENC_KEY) di baris app_settings dengan key "ai", dan TIDAK PERNAH dikembalikan oleh API: hanya status terisi dan 4 karakter
// terakhir. Kunci "ai" bukan bagian DEFAULT_CONFIG, jadi tidak ikut ke GET /config (aplikasi HP) maupun GET /settings.

const SETTING_KEY = 'ai'

const findRow = (db) => withAuditNames(db('app_settings').where({ key: SETTING_KEY }).select('app_settings.value', 'app_settings.updated_at', 'app_settings.updated_by', 'app_settings.created_at', 'app_settings.created_by'), 'app_settings').first()

/** Status tanpa membuka key: terisi atau belum, petunjuk 4 karakter terakhir, dan siapa yang terakhir mengubah. */
const status = async (db) => {
  const row = await findRow(db)
  let stored = row && row.value && row.value.api_key_enc ? row.value : null
  // Key yang tersimpan tapi tidak bisa dibuka (kunci enkripsi berganti) sama saja dengan belum diisi: admin perlu mengisi ulang
  if (stored) {
    try {
      decrypt(stored.api_key_enc)
    } catch (err) {
      stored = null
    }
  }
  const audit = row ? auditFields(row) : null
  return {
    enabled: config.ai.enabled, // AI_ENABLED di server; bila false, pengecekan AI tidak dijalankan walau key terisi
    configured: Boolean(stored),
    key_hint: stored ? stored.key_hint : null,
    model: config.ai.openai.visionModel,
    updated_at: stored ? audit.updated_at : null,
    updated_by: stored ? audit.updated_by : null,
  }
}

/** Isi, ganti, atau (api_key null) hapus API key client. */
const update = async (db, admin, { api_key: apiKey }) => {
  if (apiKey === null) {
    await db('app_settings').where({ key: SETTING_KEY }).delete()
  } else {
    await appRepo.upsertSetting(db, SETTING_KEY, { api_key_enc: encrypt(apiKey), key_hint: `…${apiKey.slice(-4)}` }, admin.id)
  }
  return status(db)
}

/** API key terdekripsi untuk dipakai server (worker pengecekan AI). null = belum diisi atau tidak bisa dibuka (mis. kunci enkripsi berganti). */
const getApiKey = async (db) => {
  const row = await db('app_settings').where({ key: SETTING_KEY }).first('value')
  if (!row || !row.value || !row.value.api_key_enc) return null
  try {
    return decrypt(row.value.api_key_enc)
  } catch (err) {
    logger.warn('API key OpenAI client tidak bisa didekripsi (kunci enkripsi berganti?); isi ulang lewat PUT /settings/ai')
    return null
  }
}

/**
 * Cek key ke OpenAI (GET /models: tidak memakai kuota dan tidak ada biayanya).
 * valid true = diterima, false = ditolak OpenAI, null = belum bisa dipastikan (OpenAI tidak terjangkau / batas pemakaian).
 */
const check = async (db) => {
  const apiKey = await getApiKey(db)
  if (!apiKey) return { configured: false, valid: false, reason: 'belum_diisi' }
  try {
    await checkApiKey({ apiKey })
    return { configured: true, valid: true, reason: null }
  } catch (err) {
    if (!(err instanceof AiError)) throw err
    if (err.code === 'ai_auth') {
      return {
        configured: true, valid: false, reason: 'ditolak', message: err.message
      }
    }
    return {
      configured: true, valid: null, reason: err.code, message: err.message,
    }
  }
}

module.exports = {
  status, update, getApiKey, check,
}
