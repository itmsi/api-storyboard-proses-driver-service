const Joi = require('joi')

// Toleransi selisih jam HP dengan server
const MAX_FUTURE_MS = 5 * 60 * 1000

const idParams = Joi.object({
  id: Joi.string().guid().required(),
})

const notInFuture = (message) => (value, helpers) => (value.getTime() > Date.now() + MAX_FUTURE_MS ? helpers.error('date.future', { message }) : value)
const dateTime = (label) => Joi.date().iso().custom(notInFuture(label)).messages({ 'date.future': `${label} tidak boleh di masa depan.` })

// Isi struk BBM; semua opsional karena OCR bisa gagal membaca dan driver mengisi lewat `corrected`
const receiptFields = Joi.object({
  time: Joi.string().pattern(/^([01]\d|2[0-3]):[0-5]\d$/).allow(null)
    .messages({ 'string.pattern.base': 'Jam struk harus berformat HH:mm.' }),
  fuel_type: Joi.string().trim().max(40).allow(null),
  liters: Joi.number().positive().max(100000).allow(null),
  price_per_liter: Joi.number().integer().min(1).max(10000000)
    .allow(null),
  total: Joi.number().integer().min(0).max(1000000000)
    .allow(null),
})

const gps = Joi.object({
  lat: Joi.number().min(-90).max(90).required(),
  lng: Joi.number().min(-180).max(180).required(),
  accuracy_m: Joi.number().min(0).max(100000),
})

/**
 * Satu skema untuk semua kategori. Field apa yang wajib bergantung pada `input` kategori
 * (receipt_ocr / manual) yang disimpan di tabel expense_categories, jadi dicek di service.
 */
const create = Joi.object({
  client_ref: Joi.string().guid({ version: 'uuidv4' }).required(),
  category: Joi.string().trim().lowercase().max(32)
    .required(),
  // kategori struk (BBM)
  media_id: Joi.string().guid(),
  ocr: receiptFields.allow(null),
  corrected: receiptFields.allow(null),
  correction_reason: Joi.string().trim().min(3).max(500)
    .allow(null, ''),
  captured_at: dateTime('Waktu struk'),
  // kategori manual
  amount: Joi.number().integer().min(1).max(1000000000),
  description: Joi.string().trim().max(500).allow(null, ''),
  proof_media_id: Joi.string().guid().allow(null),
  recorded_at: dateTime('Waktu pencatatan'),
  gps,
})

module.exports = { idParams, create }
