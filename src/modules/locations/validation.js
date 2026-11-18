const Joi = require('joi')
const { listQuery } = require('../../utils/pagination')

const TYPES = ['warehouse', 'depot', 'customer_site']

const idParams = Joi.object({
  id: Joi.string().guid().required(),
})

const list = listQuery.keys({
  type: Joi.string().valid(...TYPES),
  customer_id: Joi.string().guid(),
  city: Joi.string().trim().max(80), // kota persis (huruf besar/kecil diabaikan)
  has_coordinates: Joi.boolean(), // true = sudah punya koordinat (lat dan lng)
  has_maps_url: Joi.boolean(), // true = sudah punya tautan Google Maps
})

const fields = {
  type: Joi.string().valid(...TYPES),
  customer_id: Joi.string().guid().allow(null),
  name: Joi.string().trim().min(2).max(120),
  address: Joi.string().trim().min(3).max(300),
  city: Joi.string().trim().max(80).allow(null, ''),
  // Tautan Google Maps (maps.app.goo.gl, google.com/maps, dst.): cukup tempel dari tombol Bagikan
  maps_url: Joi.string().trim().max(500).uri({ scheme: ['http', 'https'] })
    .allow(null, '')
    .messages({ 'string.uri': 'Tautan peta harus berupa URL http/https (contoh: https://maps.app.goo.gl/xxxx).' }),
  lat: Joi.number().min(-90).max(90).allow(null),
  lng: Joi.number().min(-180).max(180).allow(null),
  geofence_radius_m: Joi.number().integer().min(10).max(5000)
    .allow(null),
  operating_hours: Joi.string().pattern(/^([01]\d|2[0-3]):[0-5]\d-([01]\d|2[0-3]):[0-5]\d$/).allow(null, '')
    .messages({ 'string.pattern.base': 'Jam operasional harus berformat HH:mm-HH:mm (contoh 08:00-17:00).' }),
  pic_name: Joi.string().trim().max(120).allow(null, ''),
  pic_phone: Joi.string().trim().max(30).allow(null, ''),
}

// Aturan antar-field (customer_site wajib punya customer, koordinat berpasangan) dicek di service
// karena pada update harus digabung dengan data yang sudah ada.
const create = Joi.object({
  ...fields,
  type: fields.type.required(),
  name: fields.name.required(),
  address: fields.address.required(),
})

const update = Joi.object(fields).min(1)

module.exports = {
  idParams, list, create, update,
}
