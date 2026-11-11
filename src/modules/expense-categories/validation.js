const Joi = require('joi')
const { listQuery } = require('../../utils/pagination')

const INPUTS = ['receipt_ocr', 'manual']

// id di path = kode kategori (mis. "bbm"), bukan uuid
const codeParams = Joi.object({
  code: Joi.string().trim().lowercase().pattern(/^[a-z0-9_-]{2,30}$/)
    .required(),
})

const list = listQuery.keys({
  is_active: Joi.boolean(),
})

const fields = {
  label: Joi.string().trim().min(2).max(60),
  input: Joi.string().valid(...INPUTS),
  description_required: Joi.boolean(),
  proof_required: Joi.boolean(),
  sort_order: Joi.number().integer().min(0).max(1000),
  is_active: Joi.boolean(),
}

const create = Joi.object({
  code: Joi.string().trim().lowercase().pattern(/^[a-z0-9_-]{2,30}$/)
    .required()
    .messages({ 'string.pattern.base': 'Kode hanya boleh huruf kecil, angka, "_" dan "-" (2-30 karakter).' }),
  ...fields,
  label: fields.label.required(),
  input: fields.input.required(),
})

// Kode tidak bisa diubah: dirujuk biaya yang sudah tercatat
const update = Joi.object(fields).min(1)

module.exports = {
  codeParams, list, create, update, INPUTS,
}
