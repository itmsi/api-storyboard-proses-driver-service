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
  // Administrator selalu memegang semua hak admin; role bawaan lain (mis. Driver) memakai hak yang tersimpan
  permissions: row.is_system && row.user_type === 'admin' ? permissions.all() : row.permissions,
  user_type: row.user_type,
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

const lockedSystem = (message) => new AppError('CONFLICT', { message, details: { reason: 'role_sistem' } })

/** Administrator terkunci penuh. Role bawaan Driver hanya boleh disesuaikan hak dan deskripsinya (lihat update). */
const assertEditable = (role) => {
  if (role.is_system) throw lockedSystem('Role bawaan tidak bisa diubah atau dihapus.')
}

/** Matriks hak sebuah role harus sesuai jenis akunnya; role driver wajib memuat hak minimum aplikasi HP. */
const normalizeFor = (userType, input) => {
  const perms = permissions.normalize(input, 'permissions', userType)
  if (userType === 'driver' && !permissions.isSubset(perms, permissions.DRIVER_REQUIRED)) {
    throw fail('permissions.driver_profile', 'Role driver wajib memuat hak driver_profile:read, tanpa itu aplikasi HP tidak bisa dibuka.')
  }
  return perms
}

/** Admin hanya boleh memberi hak yang dimilikinya sendiri (cegah menaikkan hak lewat role baru). */
const assertWithinOwn = (admin, target, userType = 'admin') => {
  // Hak role driver berlaku di aplikasi HP (bukan pengelolaan), jadi tidak dibandingkan dengan hak admin pembuatnya
  if (userType === 'admin' && !permissions.isSubset(admin.permissions, target)) {
    throw new AppError('FORBIDDEN', {
      message: 'Anda tidak boleh memberi hak yang tidak Anda miliki.',
      details: { reason: 'melebihi_hak_sendiri' },
    })
  }
}

const catalog = () => permissions.catalog()

const list = async (db, query) => {
  const paging = pagination.parse(query, SORTABLE, 'name')
  const { rows, total } = await repo.list(db, {
    search: query.search, isActive: query.is_active, userType: query.user_type, paging,
  })
  return { data: rows.map(serialize), meta: pagination.meta(paging, total) }
}

const get = async (db, id) => serialize(await load(db, id))

const create = async (db, admin, body) => {
  const perms = normalizeFor(body.user_type, body.permissions)
  assertWithinOwn(admin, perms, body.user_type)
  const code = body.code || slug(body.name)
  if (!code) throw fail('name', 'Nama harus mengandung huruf atau angka.')
  const clash = await repo.findByCodeOrName(db, { code, name: body.name })
  if (clash) throw fail(clash.code.toLowerCase() === code ? 'code' : 'name', 'Kode atau nama role sudah dipakai.')

  const id = await repo.insert(db, {
    code,
    name: body.name,
    description: body.description || null,
    permissions: JSON.stringify(perms),
    user_type: body.user_type,
    is_active: body.is_active ?? true,
    created_by: admin.id,
    updated_by: admin.id,
  })
  return get(db, id)
}

const update = async (db, admin, id, body) => {
  const role = await load(db, id)
  const driverSystem = role.is_system && role.user_type === 'driver'
  if (role.is_system && !driverSystem) assertEditable(role)
  // Role bawaan Driver: nama, kode, dan status aktif dikunci (akun driver bergantung padanya); hak dan deskripsi boleh disesuaikan
  if (driverSystem && (body.name !== undefined || body.is_active !== undefined)) {
    throw lockedSystem('Nama dan status role bawaan Driver tidak bisa diubah. Hak dan deskripsinya boleh disesuaikan.')
  }

  const fields = { updated_by: admin.id }
  if (body.name !== undefined) {
    const clash = await repo.findByCodeOrName(db, { code: role.code, name: body.name }, id)
    if (clash) throw fail('name', 'Nama role sudah dipakai.')
    fields.name = body.name
  }
  if (body.description !== undefined) fields.description = body.description || null
  if (body.is_active !== undefined) fields.is_active = body.is_active
  if (body.permissions !== undefined) {
    const perms = normalizeFor(role.user_type, body.permissions)
    assertWithinOwn(admin, perms, role.user_type)
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
