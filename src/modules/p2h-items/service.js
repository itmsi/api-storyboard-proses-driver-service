const { AppError } = require('../../utils/errors')
const { auditFields } = require('../../utils/audit')
const pagination = require('../../utils/pagination')
const { fail } = require('../../utils/accounts')
const master = require('../../utils/master')
const { bumpConfigVersion } = require('../app/settings')
const repo = require('./repository')

// Checklist P2H per perusahaan. Bisa dinonaktifkan (is_active) atau dihapus lunak (is_delete); baris tetap ada karena dirujuk jawaban P2H lama.
// Perubahan berlaku untuk P2H yang dibuat sesudahnya; P2H yang sudah ada tidak ikut berubah.

const SORTABLE = {
  sort_order: 'p2h_check_items.sort_order', label: 'p2h_check_items.label', code: 'p2h_check_items.code', created_at: 'p2h_check_items.created_at',
}

const serialize = (row) => ({
  code: row.code,
  label: row.label,
  hint: row.hint,
  is_critical: row.is_critical,
  sort_order: row.sort_order,
  is_active: row.is_active,
  ...auditFields(row),
})

const load = async (db, code) => {
  const row = await repo.findByCode(db, code)
  if (!row) throw master.notFound('code', code)
  return row
}

const list = async (db, query) => {
  const paging = pagination.parse(query, SORTABLE, 'sort_order')
  const { rows, total } = await repo.list(db, { search: query.search, isActive: query.is_active, paging })
  return { data: rows.map(serialize), meta: pagination.meta(paging, total) }
}

const get = async (db, code) => serialize(await load(db, code))

const create = async (db, admin, body) => {
  const existing = await repo.findAnyByCode(db, body.code)
  if (existing) throw fail('code', existing.is_delete ? 'Kode item ini pernah dipakai dan sudah dihapus. Pakai kode lain.' : 'Kode item sudah dipakai.')
  const sortOrder = body.sort_order ?? await repo.nextSortOrder(db)
  await db.transaction(async (trx) => {
    await repo.insert(trx, {
      code: body.code,
      label: body.label,
      hint: body.hint || null,
      is_critical: body.is_critical ?? false,
      sort_order: sortOrder,
      is_active: body.is_active ?? true,
      created_by: admin.id,
      updated_by: admin.id,
    })
    await bumpConfigVersion(trx, admin.id)
  })
  return get(db, body.code)
}

const update = async (db, admin, code, body) => {
  const current = await load(db, code)
  if (body.is_active === false && current.is_active && (await repo.countOtherActive(db, code)) === 0) {
    throw new AppError('CONFLICT', {
      message: 'Harus tersisa minimal satu item checklist yang aktif.',
      details: { reason: 'item_aktif_terakhir' },
    })
  }

  const fields = { updated_by: admin.id };
  ['label', 'is_critical', 'sort_order', 'is_active'].forEach((k) => {
    if (body[k] !== undefined) fields[k] = body[k]
  })
  if (body.hint !== undefined) fields.hint = body.hint || null

  await db.transaction(async (trx) => {
    await repo.update(trx, code, fields)
    await bumpConfigVersion(trx, admin.id)
  })
  return get(db, code)
}

const remove = async (db, admin, code) => {
  const current = await load(db, code)
  if (current.is_active && (await repo.countOtherActive(db, code)) === 0) {
    throw new AppError('CONFLICT', {
      message: 'Harus tersisa minimal satu item checklist yang aktif.',
      details: { reason: 'item_aktif_terakhir' },
    })
  }
  await db.transaction(async (trx) => {
    await repo.softDelete(trx, code, admin.id)
    await bumpConfigVersion(trx, admin.id)
  })
  return { deleted: true }
}

module.exports = {
  list, get, create, update, remove,
}
