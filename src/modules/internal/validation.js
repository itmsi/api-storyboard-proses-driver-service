const Joi = require('joi')

const clientParams = Joi.object({
  client_id: Joi.string().trim().pattern(/^[A-Za-z0-9_-]{1,64}$/).required(),
})

const seedBody = Joi.object({
  include_system_user: Joi.boolean().default(true),
}).default({ include_system_user: true })

module.exports = { clientParams, seedBody }
