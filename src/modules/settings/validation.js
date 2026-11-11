const Joi = require('joi')

const SIDES = ['depan', 'kanan', 'kiri', 'belakang']
const LANGUAGES = ['id', 'en', 'zh']

const range = Joi.object({
  min: Joi.number().integer().min(0).max(50),
  max: Joi.number().integer().min(1).max(50),
}).min(1)

// Hanya pengaturan yang memang dipakai aplikasi/server yang boleh diubah; kunci lain ditolak (bukan diabaikan)
// supaya salah ketik tidak terlihat seperti berhasil. Setiap kelompok boleh dikirim sebagian (digabung dengan nilai sekarang).
const update = Joi.object({
  modules: Joi.object({
    route_tracking: Joi.boolean(),
    receipt_ocr: Joi.boolean(),
    odometer_ocr: Joi.boolean(),
    travel_allowance: Joi.boolean(),
    incident_report: Joi.boolean(),
  }).min(1),
  photo_rules: Joi.object({
    loading: range,
    unloading: range,
    delivery_note_pages: range,
    p2h_body: Joi.object({
      required_sides: Joi.array().items(Joi.string().valid(...SIDES)).unique().min(1)
        .messages({ 'array.min': 'Minimal satu sisi foto badan kendaraan.' }),
    }).min(1),
  }).min(1),
  p2h: Joi.object({
    frequency: Joi.string().valid('daily_per_unit'),
    valid_until_local: Joi.string().pattern(/^([01]\d|2[0-3]):[0-5]\d$/)
      .messages({ 'string.pattern.base': 'Jam harus berformat HH:mm.' }),
  }).min(1),
  correction_reason_required: Joi.boolean(),
  languages: Joi.array().items(Joi.string().valid(...LANGUAGES)).unique().min(1),
  default_language: Joi.string().valid(...LANGUAGES),
}).min(1).options({ allowUnknown: false, stripUnknown: false })

module.exports = { update, SIDES, LANGUAGES }
