const Joi = require('joi')
const { listQuery } = require('../../utils/pagination')

// Validasi pengelolaan DO oleh admin (buat, daftar, ubah, batalkan). Validasi untuk driver ada di validation.js.

const STATUSES = ['assigned', 'accepted', 'loading', 'in_transit', 'handover', 'completed', 'cancelled']

const date = Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).custom((value, helpers) => (
  Number.isNaN(new Date(`${value}T00:00:00Z`).getTime()) ? helpers.error('any.invalid') : value
)).messages({ 'string.pattern.base': 'Format tanggal harus YYYY-MM-DD.' })

const list = listQuery.keys({
  status: Joi.string().valid(...STATUSES),
  driver_id: Joi.string().guid(),
  unit_id: Joi.string().guid(),
  customer_id: Joi.string().guid(),
  from: date,
  to: date,
})

const cargo = {
  description: Joi.string().trim().min(1).max(200),
  quantity: Joi.number().positive().max(1000000),
  unit: Joi.string().trim().min(1).max(30),
}

const fields = {
  customer_id: Joi.string().guid().allow(null),
  driver_id: Joi.string().guid(),
  unit_id: Joi.string().guid(),
  origin_location_id: Joi.string().guid(),
  destination_location_id: Joi.string().guid(),
  planned_load_at: Joi.date().iso().allow(null),
  estimated_distance_km: Joi.number().min(0).max(100000).allow(null),
  travel_allowance_amount: Joi.number().integer().min(0).max(1000000000),
}

const create = Joi.object({
  ...fields,
  driver_id: fields.driver_id.required(),
  unit_id: fields.unit_id.required(),
  origin_location_id: fields.origin_location_id.required(),
  destination_location_id: fields.destination_location_id.required(),
  cargo: Joi.object({
    description: cargo.description.required(),
    quantity: cargo.quantity.required(),
    unit: cargo.unit.required(),
  }).required(),
})

// Parsial: hanya field yang dikirim yang berubah (cargo juga boleh sebagian)
const update = Joi.object({
  ...fields,
  cargo: Joi.object(cargo).min(1),
}).min(1)

const cancel = Joi.object({
  reason: Joi.string().trim().min(3).max(300)
    .required(),
})

module.exports = {
  list, create, update, cancel, STATUSES,
}
