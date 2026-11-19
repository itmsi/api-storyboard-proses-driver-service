const Joi = require('joi')
const { listQuery } = require('../../utils/pagination')
const {
  ACTIONS, EXTRA_ACTIONS, USER_TYPES, RESOURCES,
} = require('../../utils/permissions')

// Semua aksi yang dikenal (CRUD dan aksi tambahan per modul); kecocokan aksi dengan modulnya diperiksa permissions.normalize
const KNOWN_ACTIONS = [...new Set([...ACTIONS, ...Object.values(EXTRA_ACTIONS).flat()])]

const idParams = Joi.object({
  id: Joi.string().guid().required(),
})

const list = listQuery.keys({
  is_active: Joi.boolean(),
  user_type: Joi.string().valid(...USER_TYPES),
})

// { "drivers": ["read", "create"], ... }; modul dan aksi asing ditolak di service (pesan per field)
const permissions = Joi.object().pattern(Joi.string(), Joi.array().items(Joi.string().valid(...KNOWN_ACTIONS)).max(KNOWN_ACTIONS.length))
  .messages({ 'any.only': `Aksi harus salah satu dari: ${KNOWN_ACTIONS.join(', ')}.` })

const fields = {
  name: Joi.string().trim().min(2).max(60),
  description: Joi.string().trim().max(300).allow(null, ''),
  permissions,
  is_active: Joi.boolean(),
}

const create = Joi.object({
  ...fields,
  code: Joi.string().trim().lowercase().pattern(/^[a-z0-9_-]{2,40}$/)
    .messages({ 'string.pattern.base': 'Kode hanya boleh huruf kecil, angka, "_" dan "-" (2-40 karakter).' }),
  // Jenis akun pemakai role: admin (modul pengelolaan) atau driver (modul aplikasi HP). Tidak bisa diubah sesudah dibuat.
  user_type: Joi.string().valid(...USER_TYPES).default('admin'),
  name: fields.name.required(),
  permissions: permissions.required(),
})

const update = Joi.object(fields).min(1)

module.exports = {
  idParams, list, create, update, RESOURCES,
}
