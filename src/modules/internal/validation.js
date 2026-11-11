const Joi = require('joi')
const { passwordRule } = require('../../utils/password')

const clientParams = Joi.object({
  clientCode: Joi.string().trim().uppercase().pattern(/^[A-Z0-9_-]{2,32}$/)
    .required(),
})

const bootstrapAdmin = Joi.object({
  username: Joi.string().trim().pattern(/^[A-Za-z0-9._-]{3,60}$/).required(),
  name: Joi.string().trim().min(2).max(120)
    .required(),
  email: Joi.string().trim().email().max(150)
    .required(),
  password: passwordRule.required(),
})

module.exports = { clientParams, bootstrapAdmin }
