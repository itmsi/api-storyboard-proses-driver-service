const Joi = require('joi')

const SIDES = ['depan', 'kanan', 'kiri', 'belakang']
const LANGUAGES = ['id', 'en', 'zh']

const hex = Joi.string().trim().pattern(/^#[0-9a-fA-F]{6}$/).messages({ 'string.pattern.base': 'Warna harus berformat #RRGGBB (contoh #0B3C8C).' })
const imageUrl = Joi.string().trim().uri({ scheme: ['http', 'https'] }).max(500)
  .allow(null)
  .messages({ 'string.uri': 'Harus berupa URL http atau https.' })

const range = Joi.object({
  min: Joi.number().integer().min(0).max(50),
  max: Joi.number().integer().min(1).max(50),
}).min(1)

// Hanya pengaturan yang memang dipakai aplikasi/server yang boleh diubah; kunci lain ditolak (bukan diabaikan)
// supaya salah ketik tidak terlihat seperti berhasil. Setiap kelompok boleh dikirim sebagian (digabung dengan nilai sekarang).
// API key OpenAI (sk-..., termasuk sk-proj-...). null = hapus key. Wajib dikirim agar PUT kosong tidak terlihat berhasil.
const aiUpdate = Joi.object({
  api_key: Joi.string().trim().pattern(/^sk-[A-Za-z0-9_-]{16,300}$/).allow(null)
    .required()
    .messages({ 'string.pattern.base': 'API key OpenAI harus berformat sk-... (tanpa spasi).' }),
}).options({ allowUnknown: false, stripUnknown: false })

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
  // Merek: kirim hanya yang berubah. null mengosongkan teks atau URL; warna tidak bisa dikosongkan (selalu ada nilai).
  branding: Joi.object({
    app_name: Joi.string().trim().min(2).max(40)
      .allow(null),
    tagline: Joi.string().trim().max(80).allow(null),
    logo_url: imageUrl,
    logo_dark_url: imageUrl,
    icon_url: imageUrl,
    colors: Joi.object({
      primary: hex,
      secondary: hex,
      accent: hex,
      on_primary: hex,
    }).min(1),
    support: Joi.object({
      label: Joi.string().trim().min(2).max(60),
      phone: Joi.string().trim().max(30).allow(null),
    }).min(1),
  }).min(1),
}).min(1).options({ allowUnknown: false, stripUnknown: false })

module.exports = {
  update, aiUpdate, SIDES, LANGUAGES,
}
