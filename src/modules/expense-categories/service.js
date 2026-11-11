const { AppError } = require('../../utils/errors')
const { auditFields } = require('../../utils/audit')
const pagination = require('../../utils/pagination')
const { fail } = require('../../utils/accounts')
const master = require('../../utils/master')
const { bumpConfigVersion } = require('../app/settings')
const repo = require('./repository')

// Kategori biaya per perusahaan (tampil di GET /config sebagai expense_categories). Tidak dihapus, hanya dinonaktifkan:
// kategori nonaktif tidak bisa dipilih driver, tetapi biaya lama yang memakainya tetap utuh.

const SORTABLE = {
  sort_order: 'expense_categories.sort_order', label: 'expense_categories.label', code: 'expense_categories.code', created_at: 'expense_categories.created_at',
}

const serialize = (row) => ({
  code: row.code,
  label: row.label,
  input: row.input,
  description_required: row.description_required,
  proof_required: row.proof_required,
  sort_order: row.sort_order,
  is_active: row.is_active,
  expense_count: Number(row.expense_count),
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
  if (await repo.findByCode(db, body.code)) throw fail('code', 'Kode kategori sudah dipakai.')
  const sortOrder = body.sort_order ?? await repo.nextSortOrder(db)
  await db.transaction(async (trx) => {
    await repo.insert(trx, {
      code: body.code,
      label: body.label,
      input: body.input,
      description_required: body.description_required ?? false,
      proof_required: body.proof_required ?? false,
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

  // Cara input menentukan bentuk data biaya (struk + OCR atau manual): mengubahnya setelah ada biaya akan merusak tampilan biaya lama
  if (body.input !== undefined && body.input !== current.input && Number(current.expense_count) > 0) {
    throw new AppError('CONFLICT', {
      message: `Cara input tidak bisa diubah: sudah ada ${Number(current.expense_count)} biaya dengan kategori ini. Buat kategori baru.`,
      details: { reason: 'masih_dipakai', expense_count: Number(current.expense_count) },
    })
  }
  if (body.is_active === false && current.is_active && (await repo.countOtherActive(db, code)) === 0) {
    throw new AppError('CONFLICT', {
      message: 'Harus tersisa minimal satu kategori biaya yang aktif.',
      details: { reason: 'kategori_aktif_terakhir' },
    })
  }

  const fields = { updated_by: admin.id };
  ['label', 'input', 'description_required', 'proof_required', 'sort_order', 'is_active'].forEach((k) => {
    if (body[k] !== undefined) fields[k] = body[k]
  })
  await db.transaction(async (trx) => {
    await repo.update(trx, code, fields)
    await bumpConfigVersion(trx, admin.id)
  })
  return get(db, code)
}

module.exports = {
  list, get, create, update,
}
