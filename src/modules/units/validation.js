const Joi = require('joi')
const { listQuery } = require('../../utils/pagination')

const STATUSES = ['active', 'maintenance', 'inactive']

const idParams = Joi.object({
  id: Joi.string().guid().required(),
})

const list = listQuery.keys({
  status: Joi.string().valid(...STATUSES),
  unit_type_id: Joi.string().guid(),
})

const date = Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).allow(null)
  .messages({ 'string.pattern.base': 'Format tanggal harus YYYY-MM-DD.' })

const fields = {
  plate: Joi.string().trim().min(3).max(15),
  unit_type_id: Joi.string().guid(),
  brand: Joi.string().trim().max(60).allow(null, ''),
  year: Joi.number().integer().min(1980).max(new Date().getFullYear() + 1)
    .allow(null),
  last_odometer_km: Joi.number().integer().min(0).max(9999999)
    .allow(null),
  status: Joi.string().valid(...STATUSES),
  stnk_expires_on: date,
  kir_expires_on: date,
}

const create = Joi.object({
  ...fields,
  plate: fields.plate.required(),
  unit_type_id: fields.unit_type_id.required(),
})

const update = Joi.object(fields).min(1)

module.exports = {
  idParams, list, create, update,
}
