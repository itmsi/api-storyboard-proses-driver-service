const Joi = require('joi')
const { listQuery } = require('../../utils/pagination')
const { SIDES } = require('../media/validation')

const unitParams = Joi.object({
  unitId: Joi.string().guid().required(),
})

// Toleransi selisih jam HP dengan server
const MAX_FUTURE_MS = 5 * 60 * 1000

const submit = Joi.object({
  client_ref: Joi.string().guid({ version: 'uuidv4' }).required(),
  checked_at: Joi.date().iso().required()
    .custom((value, helpers) => (value.getTime() > Date.now() + MAX_FUTURE_MS ? helpers.error('date.future') : value))
    .messages({ 'date.future': 'Waktu pemeriksaan tidak boleh di masa depan.' }),
  gps: Joi.object({
    lat: Joi.number().min(-90).max(90).required(),
    lng: Joi.number().min(-180).max(180).required(),
    accuracy_m: Joi.number().min(0).max(100000),
  }).required(),
  items: Joi.array().min(1).max(50).items(Joi.object({
    code: Joi.string().trim().max(32).required(),
    result: Joi.string().valid('sesuai', 'tidak_sesuai').required(),
    description: Joi.string().trim().max(500)
      .when('result', { is: 'tidak_sesuai', then: Joi.required(), otherwise: Joi.optional() })
      .messages({ 'any.required': 'Keterangan wajib diisi jika item tidak sesuai.' }),
  }))
    .required(),
  // Sisi mana yang wajib mengikuti pengaturan perusahaan (photo_rules.p2h_body.required_sides), diperiksa di service
  body_photo_ids: Joi.object(Object.fromEntries(SIDES.map((side) => [side, Joi.string().guid()]))).min(1).required(),
  admin_confirmed_by_driver: Joi.boolean(),
})

// Permintaan P2H ulang oleh admin
const recheck = Joi.object({
  note: Joi.string().trim().min(3).max(300)
    .required(),
})

const idParams = Joi.object({
  id: Joi.string().guid().required(),
})

const date = Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).messages({ 'string.pattern.base': 'Format tanggal harus YYYY-MM-DD.' })

// Daftar P2H untuk admin: POST /p2h/get
const list = listQuery.keys({
  unit_id: Joi.string().guid(),
  driver_id: Joi.string().guid(),
  status: Joi.string().valid('layak', 'catatan', 'tidak_layak'),
  from: date,
  to: date,
})

// Koreksi hasil P2H oleh admin: hanya jawaban item yang sudah ada; status dihitung ulang server
const update = Joi.object({
  items: Joi.array().min(1).max(50).items(Joi.object({
    code: Joi.string().trim().max(32).required(),
    result: Joi.string().valid('sesuai', 'tidak_sesuai').required(),
    description: Joi.string().trim().max(500)
      .when('result', { is: 'tidak_sesuai', then: Joi.required(), otherwise: Joi.optional() })
      .messages({ 'any.required': 'Keterangan wajib diisi jika item tidak sesuai.' }),
  }))
    .required(),
})

module.exports = {
  unitParams, submit, recheck, idParams, list, update,
}
