const Joi = require('joi')

const LIST_STATUSES = ['assigned', 'accepted', 'loading', 'in_transit', 'handover']

const idParams = Joi.object({
  id: Joi.string().guid().required(),
})

const listQuery = Joi.object({
  status: Joi.string().valid(...LIST_STATUSES),
})

// Tanggal kalender YYYY-MM-DD (isoDate() tidak dipakai karena mengubah nilai menjadi timestamp penuh)
const calendarDate = Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).custom((value, helpers) => (
  Number.isNaN(new Date(`${value}T00:00:00Z`).getTime()) ? helpers.error('any.invalid') : value
)).messages({ 'string.pattern.base': 'Format tanggal harus YYYY-MM-DD.' })

const historyQuery = Joi.object({
  from: calendarDate,
  to: calendarDate,
  limit: Joi.number().integer().min(1).max(50)
    .default(20),
  cursor: Joi.string().max(300),
})

// Toleransi selisih jam HP dengan server
const MAX_FUTURE_MS = 5 * 60 * 1000

const accept = Joi.object({
  client_ref: Joi.string().guid({ version: 'uuidv4' }).required(),
  accepted_at: Joi.date().iso().required()
    .custom((value, helpers) => (value.getTime() > Date.now() + MAX_FUTURE_MS ? helpers.error('date.future') : value))
    .messages({ 'date.future': 'Waktu terima tidak boleh di masa depan.' }),
  gps: Joi.object({
    lat: Joi.number().min(-90).max(90).required(),
    lng: Joi.number().min(-180).max(180).required(),
    accuracy_m: Joi.number().min(0).max(100000),
  }),
  travel_allowance_received: Joi.boolean().default(false),
})

module.exports = {
  idParams, listQuery, historyQuery, accept, LIST_STATUSES,
}
