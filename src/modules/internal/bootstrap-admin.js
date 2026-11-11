const tenant = require('../../database/tenant')
const { AppError } = require('../../utils/errors')
const password = require('../../utils/password')
const accounts = require('../../utils/accounts')

/**
 * Admin pertama sebuah perusahaan, dibuat project manage company setelah migrasi database client.
 *
 * - Belum ada admin sama sekali      -> dibuat (created: true)
 * - Admin dengan username yang sama sudah ada -> tidak melakukan apa-apa (created: false), jadi aman dipanggil ulang
 * - Sudah ada admin lain             -> ditolak 409 (admin berikutnya dibuat lewat /admin/users oleh admin itu sendiri)
 * Client yang belum aktif boleh (admin dibuat sebelum client diaktifkan).
 */
const bootstrapAdmin = async (clientCode, body) => {
  const db = await tenant.getDb(clientCode, { allowInactive: true })

  const admins = await db('users').where({ role: 'admin', is_delete: false }).select('id', 'username')
  const same = admins.find((a) => a.username.toLowerCase() === body.username.toLowerCase())
  if (same) return { created: false, admin: { id: same.id, username: same.username } }
  if (admins.length) {
    throw new AppError('CONFLICT', {
      message: 'Perusahaan ini sudah punya admin. Admin berikutnya dibuat dari API admin.',
      details: { reason: 'admin_sudah_ada' },
    })
  }

  const username = await accounts.ensureUsername(db, body.username)
  const email = await accounts.ensureEmail(db, body.email)
  const [created] = await db('users').insert({
    username,
    email,
    name: body.name,
    role: 'admin',
    status: 'active',
    password_hash: await password.hash(body.password),
  }).returning(['id', 'username'])

  return { created: true, admin: { id: created.id, username: created.username } }
}

module.exports = { bootstrapAdmin }
