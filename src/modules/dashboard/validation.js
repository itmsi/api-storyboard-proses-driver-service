const Joi = require('joi')
const { listQuery } = require('../../utils/pagination')

// Tanggal kalender YYYY-MM-DD (WIB)
const date = Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).custom((value, helpers) => (
  Number.isNaN(new Date(`${value}T00:00:00Z`).getTime()) ? helpers.error('any.invalid') : value
)).messages({ 'string.pattern.base': 'Format tanggal harus YYYY-MM-DD.' })

// Pagination standar (berlaku untuk daftar delivery_orders) + rentang tanggal (default hari ini)
const get = listQuery.keys({
  start_date: date,
  end_date: date,
})

module.exports = { get }
