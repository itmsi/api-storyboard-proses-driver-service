const Joi = require('joi')
const { listQuery } = require('../../utils/pagination')

// Pengelolaan biaya oleh admin (daftar, detail, batalkan). Validasi pencatatan biaya oleh driver ada di validation.js.

const date = Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).custom((value, helpers) => (
  Number.isNaN(new Date(`${value}T00:00:00Z`).getTime()) ? helpers.error('any.invalid') : value
)).messages({ 'string.pattern.base': 'Format tanggal harus YYYY-MM-DD.' })

const idParams = Joi.object({
  id: Joi.string().guid().required(),
})

const list = listQuery.keys({
  delivery_order_id: Joi.string().guid(),
  driver_id: Joi.string().guid(),
  category: Joi.string().trim().lowercase().max(32),
  voided: Joi.boolean(), // true = hanya yang dibatalkan, false = hanya yang berlaku; kosong = semuanya
  from: date,
  to: date,
})

const voidExpense = Joi.object({
  reason: Joi.string().trim().min(3).max(300)
    .required(),
})

module.exports = { idParams, list, voidExpense }
