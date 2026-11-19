const Joi = require('joi')
const { listQuery } = require('../../utils/pagination')
const locationSchema = require('../locations/validation')

const idParams = Joi.object({
  id: Joi.string().guid().required(),
})

const list = listQuery.keys({
  has_locations: Joi.boolean(), // true = punya lokasi aktif, false = belum punya
  has_open_orders: Joi.boolean(), // true = punya DO yang belum final, false = tidak
})

const fields = {
  name: Joi.string().trim().min(2).max(120),
  nomor_customer: Joi.string().trim().max(50).allow(null, ''), // opsional; "" / null = dikosongkan
  phone: Joi.string().trim().max(30).allow(null, ''),
  email: Joi.string().trim().email().max(150)
    .allow(null, ''),
}

const create = Joi.object({
  code: Joi.string().trim().uppercase().pattern(/^[A-Z0-9_-]{2,30}$/)
    .required()
    .messages({ 'string.pattern.base': 'Kode hanya boleh huruf, angka, "_" dan "-" (2-30 karakter).' }),
  ...fields,
  name: fields.name.required(),
  // Lokasi customer dibuat bersamaan (opsional)
  locations: locationSchema.nestedList(locationSchema.nestedCreate),
})

// Kode tidak bisa diubah: dipakai sebagai acuan di DO dan laporan
// locations: dengan id = ubah lokasi customer ini, tanpa id = lokasi baru. Lokasi yang tidak disebut tidak berubah (hapus lewat DELETE /locations/{id}).
const update = Joi.object({
  ...fields,
  locations: locationSchema.nestedList(locationSchema.nestedUpsert),
}).min(1)

module.exports = {
  idParams, list, create, update,
}
