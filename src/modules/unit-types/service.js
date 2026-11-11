const { auditFields } = require('../../utils/audit')
const pagination = require('../../utils/pagination')
const { fail } = require('../../utils/accounts')
const master = require('../../utils/master')
const repo = require('./repository')

const SORTABLE = {
  name: 'unit_types.name', code: 'unit_types.code', created_at: 'unit_types.created_at', max_load_kg: 'unit_types.max_load_kg',
}

const serialize = (row) => ({
  id: row.id,
  code: row.code,
  name: row.name,
  max_load_kg: row.max_load_kg,
  unit_count: Number(row.unit_count),
  ...auditFields(row),
})

const load = async (db, id) => {
  const row = await repo.findById(db, id)
  if (!row) throw master.notFound('unit_type_id', id)
  return row
}

const list = async (db, query) => {
  const paging = pagination.parse(query, SORTABLE, 'name')
  const { rows, total } = await repo.list(db, { search: query.search, paging })
  return { data: rows.map(serialize), meta: pagination.meta(paging, total) }
}

const get = async (db, id) => serialize(await load(db, id))

const create = async (db, admin, body) => {
  if (await repo.codeTaken(db, body.code)) throw fail('code', 'Kode tipe unit sudah dipakai.')
  const id = await repo.insert(db, {
    code: body.code,
    name: body.name,
    max_load_kg: body.max_load_kg ?? null,
    created_by: admin.id,
    updated_by: admin.id,
  })
  return get(db, id)
}

const update = async (db, admin, id, body) => {
  await load(db, id)
  await repo.update(db, id, { ...body, updated_by: admin.id })
  return get(db, id)
}

const remove = async (db, admin, id) => {
  await load(db, id)
  const units = await repo.countUnits(db, id)
  if (units > 0) {
    throw master.inUse(`Tipe unit masih dipakai ${units} unit. Ubah tipe unit-unit itu atau hapus dulu.`, { unit_count: units })
  }
  await master.softDelete(db, 'unit_types', id, admin.id)
  return { deleted: true }
}

module.exports = {
  list, get, create, update, remove,
}
