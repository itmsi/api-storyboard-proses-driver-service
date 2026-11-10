const Joi = require('joi')

const clientParams = Joi.object({
  clientCode: Joi.string().trim().uppercase().pattern(/^[A-Z0-9_-]{2,32}$/)
    .required(),
})

module.exports = { clientParams }
