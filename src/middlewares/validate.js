const { AppError } = require('../utils/errors')

const OPTIONS = {
  abortEarly: false,
  stripUnknown: true,
  convert: true,
  errors: { wrap: { label: false } },
}

/** Validasi satu nilai (dipakai juga oleh sync batch). Mengembalikan { value, details }; details kosong jika valid. */
const validateValue = (schema, input) => {
  const { value, error } = schema.validate(input, OPTIONS)
  return {
    value,
    details: error ? error.details.map((d) => ({ field: d.path.join('.'), message: d.message })) : [],
  }
}

/**
 * Validasi request dengan Joi.
 *
 *   router.post('/x', validate({ body: schema, query: schema, params: schema }), handler)
 *
 * Gagal -> 422 VALIDATION_ERROR dengan details: [{ field, message }].
 * Hasil yang sudah dibersihkan/di-cast disimpan di req.body dan req.valid.{query,params}.
 */
const validate = (schemas) => (req, res, next) => {
  const details = []
  req.valid = req.valid || {}

  Object.entries(schemas).forEach(([source, schema]) => {
    const { value, details: found } = validateValue(schema, req[source])
    if (found.length) {
      details.push(...found)
    } else if (source === 'body') {
      req.body = value
    } else {
      req.valid[source] = value
    }
  })

  if (details.length) return next(new AppError('VALIDATION_ERROR', { details }))
  return next()
}

module.exports = { validate, validateValue }
