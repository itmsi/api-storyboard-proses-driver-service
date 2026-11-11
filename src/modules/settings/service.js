const { fail } = require('../../utils/accounts')
const { resolveSettings, bumpConfigVersion } = require('../app/settings')
const appRepo = require('../app/repository')

// Pengaturan aplikasi per perusahaan: yang dibaca aplikasi lewat GET /config dan dipakai server saat memvalidasi
// (jumlah foto, sisi foto P2H, jam berlaku P2H, alasan koreksi wajib).
// Disimpan sebagai baris app_settings (satu kunci per kelompok); kunci yang belum pernah diubah memakai nilai bawaan.

const EDITABLE = ['modules', 'photo_rules', 'p2h', 'correction_reason_required', 'languages', 'default_language']

const RANGES = ['loading', 'unloading', 'delivery_note_pages']

/** Pengaturan yang berlaku sekarang (bawaan + perubahan perusahaan) beserta versinya. */
const get = async (db) => {
  const settings = await resolveSettings(db)
  return {
    config_version: settings.config_version,
    ...Object.fromEntries(EDITABLE.map((key) => [key, settings[key]])),
  }
}

/** Gabungkan perubahan ke nilai sekarang per kelompok: kelompok sebagian digabung, daftar/boolean diganti. */
const merge = (current, body) => {
  const next = {}
  if (body.modules) next.modules = { ...current.modules, ...body.modules }
  if (body.p2h) next.p2h = { ...current.p2h, ...body.p2h }
  if (body.photo_rules) {
    const rules = { ...current.photo_rules }
    RANGES.forEach((k) => { if (body.photo_rules[k]) rules[k] = { ...current.photo_rules[k], ...body.photo_rules[k] } })
    if (body.photo_rules.p2h_body) rules.p2h_body = { ...current.photo_rules.p2h_body, ...body.photo_rules.p2h_body }
    next.photo_rules = rules
  }
  ['correction_reason_required', 'languages', 'default_language'].forEach((k) => {
    if (body[k] !== undefined) next[k] = body[k]
  })
  return next
}

/** Aturan yang melibatkan beberapa field: harus dicek pada hasil gabungan, bukan pada body saja. */
const checkConsistency = (current, next) => {
  const rules = next.photo_rules || current.photo_rules
  RANGES.forEach((k) => {
    if (rules[k].min > rules[k].max) throw fail(`photo_rules.${k}`, `Jumlah minimal (${rules[k].min}) tidak boleh lebih besar dari maksimal (${rules[k].max}).`)
  })
  const languages = next.languages || current.languages
  const defaultLanguage = next.default_language || current.default_language
  if (!languages.includes(defaultLanguage)) {
    throw fail('default_language', `Bahasa bawaan "${defaultLanguage}" harus termasuk dalam daftar bahasa (${languages.join(', ')}).`)
  }
}

const update = async (db, admin, body) => {
  const current = await resolveSettings(db)
  const next = merge(current, body)
  checkConsistency(current, next)

  await db.transaction(async (trx) => {
    await Promise.all(Object.entries(next).map(([key, value]) => appRepo.upsertSetting(trx, key, value, admin.id)))
    await bumpConfigVersion(trx, admin.id)
  })
  return get(db)
}

module.exports = { get, update }
