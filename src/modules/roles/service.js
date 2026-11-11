const { AppError } = require('../../utils/errors')
const { auditFields } = require('../../utils/audit')
const pagination = require('../../utils/pagination')
const { fail } = require('../../utils/accounts')
const permissions = require('../../utils/permissions')
const repo = require('./repository')

const SORTABLE = {
  name: 'roles.name', code: 'roles.code', created_at: 'roles.created_at',
}

const serialize = (row) => ({
  id: row.id,
  code: row.code,
  name: row.name,
  description: row.description,
  // Administrator selalu memegang semua hak, mengikuti daftar modul terbaru
  permissions: row.is_system ? permissions.all() : row.permissions,
  is_system: row.is_system,
  is_active: row.is_active,
  user_count: Number(row.user_count),
  ...auditFields(row),
})

const slug = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40)

const load = async (db, id) => {
  const row = await repo.findById(db, id)
  if (!row) throw new AppError('NOT_FOUND', { details: { role_id: id } })
  return row
}

const assertEditable = (role) => {
  if (role.is_system) {
    throw new AppError('CONFLICT', { message: 'Role bawaan tidak bisa diubah atau dihapus.', details: { reason: 'role_sistem' } })
  }
}

/** Admin hanya boleh memberi hak yang dimilikinya sendiri (cegah menaikkan hak lewat role baru). */
const assertWithinOwn = (admin, target) => {
  if (!permissions.isSubset(admin.permissions, target)) {
    throw new AppError('FORBIDDEN', {
      message: 'Anda tidak boleh memberi hak yang tidak Anda miliki.',
      details: { reason: 'melebihi_hak_sendiri' },
    })
  }
}

const catalog = () => permissions.catalog()

const list = async (db, query) => {
  const paging = pagination.parse(query, SORTABLE, 'name')
  const { rows, total } = await repo.list(db, { search: query.search, isActive: query.is_active, paging })
  return { data: rows.map(serialize), meta: pagination.meta(paging, total) }
}

const get = async (db, id) => serialize(await load(db, id))

const create = async (db, admin, body) => {
  const perms = permissions.normalize(body.permissions)
  assertWithinOwn(admin, perms)
  const code = body.code || slug(body.name)
  if (!code) throw fail('name', 'Nama harus mengandung huruf atau angka.')
  const clash = await repo.findByCodeOrName(db, { code, name: body.name })
  if (clash) throw fail(clash.code.toLowerCase() === code ? 'code' : 'name', 'Kode atau nama role sudah dipakai.')

  const id = await repo.insert(db, {
    code,
    name: body.name,
    description: body.description || null,
    permissions: JSON.stringify(perms),
    is_active: body.is_active ?? true,
    created_by: admin.id,
    updated_by: admin.id,
  })
  return get(db, id)
}

const update = async (db, admin, id, body) => {
  const role = await load(db, id)
  assertEditable(role)

  const fields = { updated_by: admin.id }
  if (body.name !== undefined) {
    const clash = await repo.findByCodeOrName(db, { code: role.code, name: body.name }, id)
    if (clash) throw fail('name', 'Nama role sudah dipakai.')
    fields.name = body.name
  }
  if (body.description !== undefined) fields.description = body.description || null
  if (body.is_active !== undefined) fields.is_active = body.is_active
  if (body.permissions !== undefined) {
    const perms = permissions.normalize(body.permissions)
    assertWithinOwn(admin, perms)
    fields.permissions = JSON.stringify(perms)
  }
  await repo.update(db, id, fields)
  return get(db, id)
}

const remove = async (db, admin, id) => {
  const role = await load(db, id)
  assertEditable(role)
  const users = await repo.countUsers(db, id)
  if (users > 0) {
    throw new AppError('CONFLICT', {
      message: `Role masih dipakai ${users} akun. Pindahkan akunnya ke role lain dulu.`,
      details: { reason: 'masih_dipakai', user_count: users },
    })
  }
  await repo.softDelete(db, id, admin.id)
  return { deleted: true }
}

module.exports = {
  catalog, list, get, create, update, remove,
}
