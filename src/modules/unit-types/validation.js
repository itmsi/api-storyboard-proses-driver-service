const Joi = require('joi')
const { listQuery } = require('../../utils/pagination')

const idParams = Joi.object({
  id: Joi.string().guid().required(),
})

const list = listQuery

const fields = {
  name: Joi.string().trim().min(2).max(80),
  max_load_kg: Joi.number().integer().min(0).max(1000000)
    .allow(null),
}

const create = Joi.object({
  code: Joi.string().trim().uppercase().pattern(/^[A-Z0-9_-]{2,30}$/)
    .required()
    .messages({ 'string.pattern.base': 'Kode hanya boleh huruf, angka, "_" dan "-" (2-30 karakter).' }),
  ...fields,
  name: fields.name.required(),
})

// Kode tidak bisa diubah: dipakai sebagai acuan di data lain dan laporan
const update = Joi.object(fields).min(1)

module.exports = {
  idParams, list, create, update,
}
