const Joi = require('joi')
const { listQuery } = require('../../utils/pagination')
const { expiryStatus, expiringDays } = require('../../utils/expiry')

const STATUSES = ['active', 'maintenance', 'inactive']

const idParams = Joi.object({
  id: Joi.string().guid().required(),
})

const list = listQuery.keys({
  status: Joi.string().valid(...STATUSES),
  unit_type: Joi.string().trim().max(40),
  driver_id: Joi.string().guid(),
  has_driver: Joi.boolean(), // true = punya driver bawaan, false = belum
  stnk_status: expiryStatus, // masa berlaku STNK: expired | expiring | valid | unknown
  kir_status: expiryStatus, // masa berlaku KIR
  expiring_days: expiringDays, // batas 'expiring': hari ke depan (bawaan 30)
})

const date = Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).allow(null)
  .messages({ 'string.pattern.base': 'Format tanggal harus YYYY-MM-DD.' })

// Nomor rangka (VIN): 5-30 karakter huruf/angka/"-"; dinormalkan ke huruf besar. Dibuat longgar karena kendaraan lama tidak selalu 17 karakter.
const vin = Joi.string().trim().pattern(/^[A-Za-z0-9-]{5,30}$/).allow(null, '')
  .messages({ 'string.pattern.base': 'Nomor rangka (VIN) hanya boleh huruf, angka, dan "-" (5-30 karakter).' })

const fields = {
  plate: Joi.string().trim().min(3).max(15),
  vin_number: vin,
  unit_type: Joi.string().trim().min(2).max(40),
  max_load_kg: Joi.number().integer().min(0).max(1000000)
    .allow(null),
  brand: Joi.string().trim().max(60).allow(null, ''),
  year: Joi.number().integer().min(1980).max(new Date().getFullYear() + 1)
    .allow(null),
  last_odometer_km: Joi.number().integer().min(0).max(9999999)
    .allow(null),
  status: Joi.string().valid(...STATUSES),
  // Driver bawaan unit (drivers.id). null = tanpa driver bawaan. Satu driver maksimal satu unit.
  driver_id: Joi.string().guid().allow(null),
  stnk_expires_on: date,
  kir_expires_on: date,
}

const create = Joi.object({
  ...fields,
  plate: fields.plate.required(),
  unit_type: fields.unit_type.required(),
})

const update = Joi.object(fields).min(1)

module.exports = {
  idParams, list, create, update,
}
