const Joi = require('joi')
const { passwordRule } = require('../../utils/password')

const settings = Joi.object({
  language: Joi.string().valid('id', 'en', 'zh').required(),
})

const changePassword = Joi.object({
  current_password: Joi.string().min(1).max(128).required(),
  new_password: passwordRule.required(),
})

module.exports = { settings, changePassword }
