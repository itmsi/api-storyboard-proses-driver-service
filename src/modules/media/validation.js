const Joi = require('joi')
const { listQuery } = require('../../utils/pagination')

const KINDS = [
  'odometer_start', 'odometer_end', 'receipt', 'loading', 'delivery_note',
  'unloading', 'stamped_delivery_note', 'p2h_body', 'damage', 'location', 'signature',
]
const SIDES = ['depan', 'kanan', 'kiri', 'belakang']

const gps = Joi.object({
  lat: Joi.number().min(-90).max(90).required(),
  lng: Joi.number().min(-180).max(180).required(),
  accuracy_m: Joi.number().min(0).max(100000),
})

// Field multipart selalu string, jadi gps datang sebagai JSON string
const gpsField = Joi.any().custom((value, helpers) => {
  let parsed = value
  if (typeof value === 'string') {
    try {
      parsed = JSON.parse(value)
    } catch (err) {
      return helpers.message('gps harus berupa JSON dengan lat, lng, accuracy_m.')
    }
  }
  const { error, value: clean } = gps.validate(parsed, { stripUnknown: true })
  return error ? helpers.message(error.message) : clean
})

// Toleransi selisih jam HP dengan server
const MAX_FUTURE_MS = 5 * 60 * 1000

const upload = Joi.object({
  kind: Joi.string().valid(...KINDS).required(),
  client_ref: Joi.string().guid({ version: 'uuidv4' }).required(),
  captured_at: Joi.date().iso().required()
    .custom((value, helpers) => (value.getTime() > Date.now() + MAX_FUTURE_MS ? helpers.error('date.future') : value))
    .messages({ 'date.future': 'Waktu foto tidak boleh di masa depan.' }),
  gps: gpsField,
  side: Joi.string().valid(...SIDES).when('kind', { is: 'p2h_body', then: Joi.required(), otherwise: Joi.forbidden() }),
})

const idParams = Joi.object({
  id: Joi.string().guid().required(),
})

const date = Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).messages({ 'string.pattern.base': 'Format tanggal harus YYYY-MM-DD.' })

// Daftar media untuk admin: POST /media/get
const list = listQuery.keys({
  kind: Joi.string().valid(...KINDS),
  captured_by: Joi.string().guid(),
  from: date,
  to: date,
})

module.exports = {
  upload, KINDS, SIDES, idParams, list,
}
