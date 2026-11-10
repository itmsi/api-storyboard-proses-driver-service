const Joi = require('joi')

const settings = Joi.object({
  language: Joi.string().valid('id', 'en', 'zh').required(),
})

module.exports = { settings }
