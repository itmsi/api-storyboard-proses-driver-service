const Joi = require('joi')
const { listQuery } = require('../../utils/pagination')

const MAX_FUTURE_MS = 5 * 60 * 1000 // toleransi selisih jam

const date = Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).custom((value, helpers) => (
  Number.isNaN(new Date(`${value}T00:00:00Z`).getTime()) ? helpers.error('any.invalid') : value
)).messages({ 'string.pattern.base': 'Format tanggal harus YYYY-MM-DD.' })

// id di path = id delivery order (satu DO punya paling banyak satu rekap)
const idParams = Joi.object({
  id: Joi.string().guid().required(),
})

const list = listQuery.keys({
  type: Joi.string().valid('refund_to_company', 'payable_to_driver', 'balanced'),
  settled: Joi.boolean(), // true = sudah disetor/dibayar, false = belum
  driver_id: Joi.string().guid(),
  from: date,
  to: date,
})

const settle = Joi.object({
  note: Joi.string().trim().max(300).allow(null, ''),
  settled_at: Joi.date().iso()
    .custom((value, helpers) => (value.getTime() > Date.now() + MAX_FUTURE_MS ? helpers.error('date.future') : value))
    .messages({ 'date.future': 'Waktu penyelesaian tidak boleh di masa depan.' }),
})

module.exports = { idParams, list, settle }
