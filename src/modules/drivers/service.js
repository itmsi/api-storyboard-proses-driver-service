const { AppError } = require('../../utils/errors')
const { auditFields } = require('../../utils/audit')
const { toWib, wibDate } = require('../../utils/date')
const pagination = require('../../utils/pagination')
const password = require('../../utils/password')
const accounts = require('../../utils/accounts')
const adminAuthRepo = require('../auth/repository')
const repo = require('./repository')

const SORTABLE = {
  name: 'users.name', code: 'drivers.code', created_at: 'drivers.created_at', last_login_at: 'users.last_login_at',
}

const serialize = (row, extra = {}) => ({
  id: row.id,
  code: row.code,
  name: row.name,
  phone: row.phone,
  status: row.user_status,
  role: row.role_id ? { id: row.role_id, name: row.role_name } : null,
  license: {
    no: row.license_no,
    type: row.license_type,
    expires_on: row.license_expires_on,
  },
  unit_today: row.unit_id ? { id: row.unit_id, plate: row.unit_plate } : null,
  last_login_at: toWib(row.last_login_at),
  locked: Boolean(row.locked_until && new Date(row.locked_until) > new Date()),
  locked_until: row.locked_until && new Date(row.locked_until) > new Date() ? toWib(row.locked_until) : null,
  ...extra,
  ...auditFields(row),
})

const load = async (db, id) => {
  const row = await repo.findById(db, wibDate(), id)
  if (!row) throw new AppError('NOT_FOUND', { details: { driver_id: id } })
  return row
}

const list = async (db, query) => {
  const paging = pagination.parse(query, SORTABLE, 'name')
  const { rows, total } = await repo.list(db, {
    today: wibDate(), search: query.search, status: query.status, roleId: query.role_id, paging,
  })
  return { data: rows.map((r) => serialize(r)), meta: pagination.meta(paging, total) }
}

const get = async (db, id) => {
  const row = await load(db, id)
  const active = await repo.findActiveDo(db, id)
  return serialize(row, {
    active_do: active ? { id: active.id, no: active.no, status: active.status } : null,
    failed_login_count: row.failed_login_count,
  })
}

/** Kode otomatis DRV-0001, ...; lompati yang sudah terpakai (mis. DRV-0021 dari data awal). */
const nextCode = async (db) => {
  for (let i = 0; i < 100; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    const code = `DRV-${String(await repo.nextSequence(db)).padStart(4, '0')}`
    // eslint-disable-next-line no-await-in-loop
    if (!(await repo.codeUsed(db, code))) return code
  }
  throw new AppError('INTERNAL_ERROR', { details: { reason: 'tidak menemukan kode driver yang kosong' } })
}

/** Role harus ada, aktif, dan untuk akun driver (bukan role admin). Tanpa id = role bawaan Driver. */
const resolveRole = async (db, roleId) => {
  const role = await repo.findDriverRole(db, roleId)
  if (!role) throw accounts.fail('role_id', roleId ? 'Role driver tidak ditemukan (role admin tidak bisa dipakai untuk akun driver).' : 'Role bawaan Driver tidak ditemukan.')
  if (!role.is_active) throw accounts.fail('role_id', 'Role sedang nonaktif.')
  return role
}

const create = async (db, admin, body) => {
  const role = await resolveRole(db, body.role_id)
  const phone = await accounts.ensurePhone(db, body.phone)

  let { code } = body
  if (code) {
    if (await repo.codeUsed(db, code)) throw accounts.fail('code', 'Kode driver sudah pernah dipakai.')
    await accounts.ensureUsername(db, code)
  } else {
    code = await nextCode(db)
  }

  const generated = !body.password
  const plain = body.password || password.generate()
  const passwordHash = await password.hash(plain)

  const id = await db.transaction((trx) => repo.insertDriver(
    trx,
    {
      username: code,
      phone,
      password_hash: passwordHash,
      role_id: role.id,
      name: body.name,
      status: 'active',
      created_by: admin.id,
      updated_by: admin.id,
    },
    {
      code,
      license_no: body.license_no || null,
      license_type: body.license_type || null,
      license_expires_on: body.license_expires_on || null,
      status: 'active',
      created_by: admin.id,
      updated_by: admin.id,
    }
  ))

  const row = await load(db, id)
  return serialize(row, generated ? { initial_password: plain } : {})
}

const update = async (db, admin, id, body) => {
  const row = await load(db, id)
  const user = { updated_by: admin.id }
  const driver = { updated_by: admin.id }

  if (body.name !== undefined) user.name = body.name
  if (body.role_id !== undefined) user.role_id = (await resolveRole(db, body.role_id)).id
  if (body.phone !== undefined) user.phone = await accounts.ensurePhone(db, body.phone, row.user_id)
  if (body.status !== undefined) {
    user.status = body.status
    driver.status = body.status === 'active' ? 'active' : 'inactive'
  }
  ['license_no', 'license_type', 'license_expires_on'].forEach((k) => {
    if (body[k] !== undefined) driver[k] = body[k] || null
  })

  await db.transaction(async (trx) => {
    await repo.updateUser(trx, row.user_id, user)
    await repo.updateDriver(trx, id, driver)
    // Dinonaktifkan: sesi di HP tidak boleh diperpanjang lagi (access token yang sudah terbit habis sendiri)
    if (body.status === 'suspended') await adminAuthRepo.revokeTokens(trx, row.user_id)
  })
  return get(db, id)
}

const resetPassword = async (db, admin, id, body) => {
  const row = await load(db, id)
  const generated = !body.password
  const plain = body.password || password.generate()
  await adminAuthRepo.updatePassword(db, row.user_id, await password.hash(plain), admin.id)
  await adminAuthRepo.revokeTokens(db, row.user_id) // semua perangkat harus login ulang
  return { password_reset: true, ...(generated ? { temporary_password: plain } : {}) }
}

const unlock = async (db, admin, id) => {
  const row = await load(db, id)
  await repo.updateUser(db, row.user_id, { failed_login_count: 0, locked_until: null, updated_by: admin.id })
  return get(db, id)
}

const remove = async (db, admin, id) => {
  const row = await load(db, id)
  const active = await repo.findActiveDo(db, id)
  if (active) {
    throw new AppError('INVALID_STATE', {
      message: `Driver masih punya DO berjalan (${active.no}). Selesaikan atau batalkan DO itu dulu.`,
      details: { active_do_id: active.id, active_do_no: active.no },
    })
  }
  await db.transaction(async (trx) => {
    await repo.softDelete(trx, row, admin.id)
    await adminAuthRepo.revokeTokens(trx, row.user_id)
  })
  return { deleted: true }
}

module.exports = {
  list, get, create, update, resetPassword, unlock, remove,
}
