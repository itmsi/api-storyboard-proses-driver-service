const Joi = require('joi')

const MAX_FUTURE_MS = 5 * 60 * 1000 // toleransi selisih jam HP dengan server

const idParams = Joi.object({
  id: Joi.string().guid().required(),
})

const dateTime = (label) => Joi.date().iso()
  .custom((value, helpers) => (value.getTime() > Date.now() + MAX_FUTURE_MS ? helpers.error('date.future') : value))
  .messages({ 'date.future': `${label} tidak boleh di masa depan.` })

const ids = (min = 1) => Joi.array().items(Joi.string().guid()).min(min).max(50)

const receiver = Joi.object({
  name: Joi.string().trim().min(2).max(120)
    .required(),
  signature_media_id: Joi.string().guid().required(),
  signed_at: dateTime('Waktu tanda tangan').required(),
  acknowledges_issues: Joi.boolean(),
})

const issue = Joi.object({
  type: Joi.string().valid('rusak', 'kurang', 'salah_kirim', 'lainnya').required(),
  quantity: Joi.number().positive().max(1000000)
    .required(),
  unit: Joi.string().trim().min(1).max(30)
    .required(),
  note: Joi.string().trim().max(500).allow(null, ''),
  photo_ids: ids(0).default([]),
})

/**
 * Bentuk request bergantung pada `condition`:
 *   lengkap     -> foto bongkar, surat jalan bercap, penerima + tanda tangan
 *   masalah     -> sama + issues, received_quantity, receiver.acknowledges_issues
 *   gagal_kirim -> failure_reason + foto lokasi (penerima null)
 * Jumlah minimal/maksimal foto mengikuti photo_rules di /config, dicek di service.
 */
const handover = Joi.object({
  client_ref: Joi.string().guid({ version: 'uuidv4' }).required(),
  condition: Joi.string().valid('lengkap', 'masalah', 'gagal_kirim').required(),
  gps: Joi.object({
    lat: Joi.number().min(-90).max(90).required(),
    lng: Joi.number().min(-180).max(180).required(),
    accuracy_m: Joi.number().min(0).max(100000),
  }).required(),
  recorded_at: dateTime('Waktu serah terima'),

  unloading_photo_ids: Joi.when('condition', { is: 'gagal_kirim', then: Joi.forbidden(), otherwise: ids().required() }),
  stamped_delivery_note_ids: Joi.when('condition', { is: 'gagal_kirim', then: Joi.forbidden(), otherwise: ids().required() }),
  receiver: Joi.when('condition', {
    is: 'gagal_kirim',
    then: Joi.valid(null).optional(),
    otherwise: receiver.required(),
  }),

  issues: Joi.when('condition', {
    is: 'masalah',
    then: Joi.array().items(issue).min(1).max(20)
      .required(),
    otherwise: Joi.forbidden()
  }),
  received_quantity: Joi.when('condition', {
    is: 'masalah',
    then: Joi.number().min(0).max(1000000)
      .required(),
    otherwise: Joi.forbidden()
  }),

  failure_reason: Joi.when('condition', {
    is: 'gagal_kirim',
    then: Joi.string().valid('penerima_tidak_ada', 'alamat_tidak_ditemukan', 'ditolak_penerima', 'lainnya').required(),
    otherwise: Joi.forbidden(),
  }),
  location_photo_ids: Joi.when('condition', { is: 'gagal_kirim', then: ids().required(), otherwise: Joi.forbidden() }),
  note: Joi.string().trim().max(500).allow(null, ''),
})

module.exports = { idParams, handover }
