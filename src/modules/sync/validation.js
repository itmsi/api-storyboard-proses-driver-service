const Joi = require('joi')

const MAX_ITEMS = 100

const item = Joi.object({
  client_ref: Joi.string().guid({ version: 'uuidv4' }).required(),
  method: Joi.string().uppercase().valid('POST', 'PUT').required(),
  path: Joi.string().trim().max(300).required(),
  body: Joi.object().unknown(true).required(),
  client_created_at: Joi.date().iso().required(),
})

const batch = Joi.object({
  device_id: Joi.string().trim().min(3).max(128)
    .required(),
  items: Joi.array().items(item).min(1).max(MAX_ITEMS)
    .required(),
}).custom((value, helpers) => {
  const refs = value.items.map((i) => i.client_ref)
  return new Set(refs).size === refs.length ? value : helpers.message('items tidak boleh memuat client_ref yang sama dua kali.')
})

module.exports = { batch, MAX_ITEMS }
