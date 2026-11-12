const bcrypt = require('bcrypt')
const config = require('../../config')
const { AppError } = require('../../utils/errors')

/**
 * Akun sistem MSI ("ghost user", mis. msi.support) di database perusahaan: admin bawaan untuk dukungan, antara lain
 * membuatkan admin pertama perusahaan lewat POST /users. Username dan password datang dari saas-api.
 * Idempoten: dibuat jika belum ada, selain itu hanya disegarkan (password, aktif, kunci dibuka).
 *
 * @param db        knex dengan hak tulis (role owner)
 * @param username  username dari saas-api
 * @param password  password plaintext (sudah didekripsi); tidak pernah dicatat
 * @returns {Promise<{ action: 'created'|'updated', id: string }>}
 */
const upsertSystemUser = async (db, { username, password }) => {
  const passwordHash = await bcrypt.hash(password, config.auth.bcryptRounds)
  const existing = await db('users').where({ is_system: true, is_delete: false }).first('id')

  if (existing) {
    // Username boleh berganti (saas-api yang menentukan) selama tidak bentrok dengan akun perusahaan
    const clash = await db('users').whereRaw('lower(username) = lower(?)', [username]).where({ is_delete: false }).whereNot({ id: existing.id })
      .first('id')
    if (clash) throw new AppError('CONFLICT', { message: `Username "${username}" sudah dipakai akun perusahaan.`, details: { reason: 'system_user_bentrok' } })
    await db('users').where({ id: existing.id }).update({
      username, password_hash: passwordHash, status: 'active', failed_login_count: 0, locked_until: null,
    })
    // Akun sistem selalu Administrator (juga untuk akun yang dibuat sebelum ada role)
    await db('users').where({ id: existing.id }).whereNull('role_id').update({
      role_id: db('roles').where({ is_system: true, user_type: 'admin', is_delete: false }).select('id').limit(1),
    })
    // Password berganti: semua sesi lama akun ini tidak boleh hidup terus
    await db('refresh_tokens').where({ user_id: existing.id }).whereNull('revoked_at').update({ revoked_at: db.fn.now() })
    return { action: 'updated', id: existing.id }
  }

  const clash = await db('users').whereRaw('lower(username) = lower(?)', [username]).where({ is_delete: false }).first('id')
  if (clash) throw new AppError('CONFLICT', { message: `Username "${username}" sudah dipakai akun perusahaan.`, details: { reason: 'system_user_bentrok' } })

  const administrator = await db('roles').where({ is_system: true, user_type: 'admin', is_delete: false }).first('id')
  const [created] = await db('users').insert({
    username,
    name: 'MSI Support',
    role_id: administrator ? administrator.id : null,
    status: 'active',
    is_system: true,
    password_hash: passwordHash,
  }).returning('id')
  return { action: 'created', id: created.id }
}

module.exports = { upsertSystemUser }
