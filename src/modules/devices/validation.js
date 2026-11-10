const Joi = require('joi')

const pushToken = Joi.object({
  device_id: Joi.string().trim().min(3).max(128)
    .required(),
  fcm_token: Joi.string().trim().min(10).max(4096)
    .required(),
})

module.exports = { pushToken }
