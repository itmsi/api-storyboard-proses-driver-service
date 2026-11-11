const Joi = require('joi')
const { listQuery } = require('../../utils/pagination')
const { passwordRule } = require('../../utils/password')

const idParams = Joi.object({
  id: Joi.string().guid().required(),
})

const list = listQuery.keys({
  status: Joi.string().valid('active', 'suspended'),
  role_id: Joi.string().guid(),
})

const email = Joi.string().trim().email().max(150)

const create = Joi.object({
  name: Joi.string().trim().min(2).max(120)
    .required(),
  username: Joi.string().trim().pattern(/^[A-Za-z0-9._-]{3,60}$/)
    .required()
    .messages({ 'string.pattern.base': 'Username hanya boleh huruf, angka, ".", "_", "-" (3-60 karakter).' }),
  email: email.required(),
  phone: Joi.string().trim().max(30).allow(null, ''),
  // Role menentukan hak akses (lihat /roles). Kosong = role Administrator (hanya boleh oleh admin dengan hak setara)
  role_id: Joi.string().guid(),
  // Kosong = dibuatkan password sementara (dikembalikan sekali di response)
  password: passwordRule,
})

const update = Joi.object({
  name: Joi.string().trim().min(2).max(120),
  email,
  phone: Joi.string().trim().max(30).allow(null, ''),
  status: Joi.string().valid('active', 'suspended'),
  role_id: Joi.string().guid(),
}).min(1)

const resetPassword = Joi.object({
  password: passwordRule,
})

module.exports = {
  idParams, list, create, update, resetPassword,
}
