const Joi = require('joi')

const MAX_FUTURE_MS = 5 * 60 * 1000 // toleransi selisih jam HP dengan server

const idParams = Joi.object({
  id: Joi.string().guid().required(),
})

const complete = Joi.object({
  client_ref: Joi.string().guid({ version: 'uuidv4' }).required(),
  completed_at: Joi.date().iso().required()
    .custom((value, helpers) => (value.getTime() > Date.now() + MAX_FUTURE_MS ? helpers.error('date.future') : value))
    .messages({ 'date.future': 'Waktu selesai tidak boleh di masa depan.' }),
  gps: Joi.object({
    lat: Joi.number().min(-90).max(90).required(),
    lng: Joi.number().min(-180).max(180).required(),
    accuracy_m: Joi.number().min(0).max(100000),
  }),
})

module.exports = { idParams, complete }
