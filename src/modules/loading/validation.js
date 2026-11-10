const Joi = require('joi')

// Toleransi selisih jam HP dengan server
const MAX_FUTURE_MS = 5 * 60 * 1000

const idParams = Joi.object({
  id: Joi.string().guid().required(),
})

const loading = Joi.object({
  client_ref: Joi.string().guid({ version: 'uuidv4' }).required(),
  loaded_at: Joi.date().iso().required()
    .custom((value, helpers) => (value.getTime() > Date.now() + MAX_FUTURE_MS ? helpers.error('date.future') : value))
    .messages({ 'date.future': 'Waktu muat tidak boleh di masa depan.' }),
  gps: Joi.object({
    lat: Joi.number().min(-90).max(90).required(),
    lng: Joi.number().min(-180).max(180).required(),
    accuracy_m: Joi.number().min(0).max(100000),
  }),
  cargo_photo_ids: Joi.array().items(Joi.string().guid()).min(1).max(50)
    .required(),
  quantity_matches_do: Joi.boolean().required(),
  // Jika jumlah tidak sesuai DO, catatan wajib dan tidak boleh kosong
  quantity_note: Joi.when('quantity_matches_do', {
    is: false,
    then: Joi.string().trim().min(1).max(500)
      .required()
      .messages({
        'any.required': 'Catatan wajib diisi jika jumlah barang tidak sesuai DO.',
        'string.empty': 'Catatan wajib diisi jika jumlah barang tidak sesuai DO.',
        'string.base': 'Catatan wajib diisi jika jumlah barang tidak sesuai DO.',
      }),
    otherwise: Joi.string().trim().max(500).allow(null, ''),
  }),
  delivery_note_pages: Joi.array().items(Joi.object({
    page: Joi.number().integer().min(1).max(50)
      .required(),
    media_id: Joi.string().guid().required(),
  })).min(1).max(50)
    .required(),
})

module.exports = { idParams, loading }
