const Joi = require('joi')

const idParams = Joi.object({
  id: Joi.string().guid().required(),
})

module.exports = { idParams }
