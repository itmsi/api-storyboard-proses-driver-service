const Joi = require('joi')
const { listQuery } = require('../../utils/pagination')

const date = Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).custom((value, helpers) => (
  Number.isNaN(new Date(`${value}T00:00:00Z`).getTime()) ? helpers.error('any.invalid') : value
)).messages({ 'string.pattern.base': 'Format tanggal harus YYYY-MM-DD.' })

const idParams = Joi.object({
  id: Joi.string().guid().required(),
})

// Tanpa ?date: penugasan hari ini
const list = listQuery.keys({
  date,
  driver_id: Joi.string().guid(),
  unit_id: Joi.string().guid(),
})

const assign = Joi.object({
  driver_id: Joi.string().guid().required(),
  unit_id: Joi.string().guid().required(),
  work_date: date.required(),
})

module.exports = { idParams, list, assign }
