const Joi = require('joi')

const device = Joi.object({
  device_id: Joi.string().trim().min(3).max(128)
    .required(),
  app_version: Joi.string().trim().max(32).allow('', null),
  os: Joi.string().trim().max(64).allow('', null),
})

// Satu login untuk driver (aplikasi HP) dan admin (web). Peran dibaca dari akunnya:
// driver wajib mengirim `device`, admin tidak (dicek di service karena bergantung pada peran akun).
const login = Joi.object({
  client_code: Joi.string().trim().uppercase().pattern(/^[A-Z0-9_-]{2,32}$/)
    .required(),
  username: Joi.string().trim().min(3).max(120)
    .required(), // driver: ID driver atau No. HP; admin: username atau email
  password: Joi.string().min(1).max(128).required(),
  device,
  remember_me: Joi.boolean().default(true),
})

const refresh = Joi.object({
  refresh_token: Joi.string().trim().max(256).required(),
})

module.exports = { login, refresh }
