const Joi = require('joi')

const device = Joi.object({
  device_id: Joi.string().trim().min(3).max(128)
    .required(),
  app_version: Joi.string().trim().max(32).allow('', null),
  os: Joi.string().trim().max(64).allow('', null),
})

const login = Joi.object({
  client_code: Joi.string().trim().uppercase().pattern(/^[A-Z0-9_-]{2,32}$/)
    .required(),
  username: Joi.string().trim().min(3).max(64)
    .required(), // ID driver atau No. HP
  password: Joi.string().min(1).max(128).required(),
  device: device.required(),
  remember_me: Joi.boolean().default(true),
})

const refresh = Joi.object({
  refresh_token: Joi.string().trim().max(256).required(),
})

module.exports = { login, refresh }
