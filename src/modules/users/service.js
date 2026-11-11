const { AppError } = require('../../utils/errors')
const { auditFields } = require('../../utils/audit')
const { toWib } = require('../../utils/date')
const pagination = require('../../utils/pagination')
const password = require('../../utils/password')
const accounts = require('../../utils/accounts')
const adminAuthRepo = require('../auth/repository')
const repo = require('./repository')

const SORTABLE = {
  name: 'users.name', username: 'users.username', created_at: 'users.created_at', last_login_at: 'users.last_login_at',
}

const serialize = (row, extra = {}) => ({
  id: row.id,
  username: row.username,
  email: row.email,
  phone: row.phone,
  name: row.name,
  status: row.status,
  last_login_at: toWib(row.last_login_at),
  locked: Boolean(row.locked_until && new Date(row.locked_until) > new Date()),
  ...extra,
  ...auditFields(row),
})

const load = async (db, id) => {
  const row = await repo.findById(db, id)
  if (!row) throw new AppError('NOT_FOUND', { details: { user_id: id } })
  return row
}

const blocked = (message, reason) => new AppError('CONFLICT', { message, details: { reason } })

/**
 * Admin tidak boleh menonaktifkan/menghapus dirinya sendiri, dan harus selalu tersisa minimal satu admin aktif,
 * supaya perusahaan tidak terkunci dari API-nya sendiri.
 */
const assertCanRemoveAccess = async (db, admin, target) => {
  if (target.id === admin.id) throw blocked('Anda tidak bisa menonaktifkan atau menghapus akun Anda sendiri.', 'akun_sendiri')
  if (target.status === 'active' && (await repo.countOtherActive(db, target.id)) === 0) {
    throw blocked('Harus tersisa minimal satu admin aktif.', 'admin_aktif_terakhir')
  }
}

const list = async (db, query) => {
  const paging = pagination.parse(query, SORTABLE, 'name')
  const { rows, total } = await repo.list(db, { search: query.search, status: query.status, paging })
  return { data: rows.map((r) => serialize(r)), meta: pagination.meta(paging, total) }
}

const get = async (db, id) => serialize(await load(db, id))

const create = async (db, admin, body) => {
  const username = await accounts.ensureUsername(db, body.username)
  const email = await accounts.ensureEmail(db, body.email)
  const phone = await accounts.ensurePhone(db, body.phone)

  const generated = !body.password
  const plain = body.password || password.generate()
  const id = await repo.insert(db, {
    username,
    email,
    phone,
    name: body.name,
    role: 'admin',
    status: 'active',
    password_hash: await password.hash(plain),
    created_by: admin.id,
    updated_by: admin.id,
  })
  return serialize(await load(db, id), generated ? { initial_password: plain } : {})
}

const update = async (db, admin, id, body) => {
  const target = await load(db, id)
  const fields = { updated_by: admin.id }
  if (body.name !== undefined) fields.name = body.name
  if (body.email !== undefined) fields.email = await accounts.ensureEmail(db, body.email, id)
  if (body.phone !== undefined) fields.phone = await accounts.ensurePhone(db, body.phone, id)
  if (body.status !== undefined) {
    if (body.status === 'suspended') await assertCanRemoveAccess(db, admin, target)
    fields.status = body.status
  }
  await repo.update(db, id, fields)
  if (body.status === 'suspended') await adminAuthRepo.revokeTokens(db, id)
  return get(db, id)
}

const resetPassword = async (db, admin, id, body) => {
  await load(db, id)
  const generated = !body.password
  const plain = body.password || password.generate()
  await adminAuthRepo.updatePassword(db, id, await password.hash(plain), admin.id)
  if (id !== admin.id) await adminAuthRepo.revokeTokens(db, id) // akun lain: semua sesinya habis
  return { password_reset: true, ...(generated ? { temporary_password: plain } : {}) }
}

const remove = async (db, admin, id) => {
  const target = await load(db, id)
  await assertCanRemoveAccess(db, admin, target)
  await repo.softDelete(db, id, admin.id)
  await adminAuthRepo.revokeTokens(db, id)
  return { deleted: true }
}

module.exports = {
  list, get, create, update, resetPassword, remove,
}
