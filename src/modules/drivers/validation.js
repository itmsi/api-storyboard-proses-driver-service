const Joi = require('joi')
const { listQuery } = require('../../utils/pagination')
const { expiryStatus, expiringDays } = require('../../utils/expiry')
const { passwordRule } = require('../../utils/password')

const idParams = Joi.object({
  id: Joi.string().guid().required(),
})

const list = listQuery.keys({
  status: Joi.string().valid('active', 'suspended'),
  role_id: Joi.string().guid(),
  license_type: Joi.string().trim().max(20), // jenis SIM persis (A, B1, B1 Umum, B2, B2 Umum; huruf besar/kecil diabaikan)
  license_status: expiryStatus, // masa berlaku SIM: expired | expiring | valid | unknown
  expiring_days: expiringDays, // batas 'expiring': hari ke depan (bawaan 30)
  has_unit: Joi.boolean(), // true = punya unit bawaan, false = belum
})

const license = {
  license_no: Joi.string().trim().max(40).allow(null, ''),
  license_type: Joi.string().trim().max(20).allow(null, ''),
  license_expires_on: Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).allow(null)
    .messages({ 'string.pattern.base': 'Format tanggal harus YYYY-MM-DD.' }),
}

const create = Joi.object({
  name: Joi.string().trim().min(2).max(120)
    .required(),
  phone: Joi.string().trim().max(30).allow(null, ''),
  // Kosong = kode otomatis DRV-0001, DRV-0002, ...
  code: Joi.string().trim().uppercase().pattern(/^[A-Z0-9-]{3,20}$/)
    .messages({ 'string.pattern.base': 'Kode hanya boleh huruf, angka, dan "-" (3-20 karakter).' }),
  // Role driver (hak di aplikasi HP, lihat /roles dengan user_type driver). Kosong = role bawaan Driver.
  role_id: Joi.string().guid(),
  // Kosong = dibuatkan password sementara (dikembalikan sekali di response)
  password: passwordRule,
  ...license,
})

const update = Joi.object({
  name: Joi.string().trim().min(2).max(120),
  phone: Joi.string().trim().max(30).allow(null, ''),
  status: Joi.string().valid('active', 'suspended'),
  role_id: Joi.string().guid(),
  ...license,
}).min(1)

const resetPassword = Joi.object({
  password: passwordRule,
})

module.exports = {
  idParams, list, create, update, resetPassword,
}
