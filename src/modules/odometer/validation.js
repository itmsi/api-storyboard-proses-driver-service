const Joi = require('joi')

const LEVELS = ['empty', 'quarter', 'half', 'three_quarter', 'full']
const MAX_FUTURE_MS = 5 * 60 * 1000 // toleransi selisih jam HP dengan server

const idParams = Joi.object({
  id: Joi.string().guid().required(),
})

const reading = Joi.object({
  km: Joi.number().integer().min(0).max(9999999)
    .allow(null),
  fuel_level: Joi.string().valid(...LEVELS).allow(null),
})

const odometer = Joi.object({
  client_ref: Joi.string().guid({ version: 'uuidv4' }).required(),
  type: Joi.string().valid('start', 'end').required(),
  media_id: Joi.string().guid().required(),
  ocr: reading.allow(null),
  corrected: reading.allow(null),
  correction_reason: Joi.string().trim().min(3).max(500)
    .allow(null, ''),
  captured_at: Joi.date().iso().required()
    .custom((value, helpers) => (value.getTime() > Date.now() + MAX_FUTURE_MS ? helpers.error('date.future') : value))
    .messages({ 'date.future': 'Waktu foto tidak boleh di masa depan.' }),
  gps: Joi.object({
    lat: Joi.number().min(-90).max(90).required(),
    lng: Joi.number().min(-180).max(180).required(),
    accuracy_m: Joi.number().min(0).max(100000),
  }),
})

module.exports = { idParams, odometer, LEVELS }
