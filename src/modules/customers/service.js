const { auditFields } = require('../../utils/audit')
const pagination = require('../../utils/pagination')
const { fail } = require('../../utils/accounts')
const master = require('../../utils/master')
const repo = require('./repository')

const SORTABLE = {
  name: 'customers.name', code: 'customers.code', created_at: 'customers.created_at',
}

const serialize = (row) => ({
  id: row.id,
  code: row.code,
  name: row.name,
  phone: row.phone,
  email: row.email,
  location_count: Number(row.location_count),
  ...auditFields(row),
})

const load = async (db, id) => {
  const row = await repo.findById(db, id)
  if (!row) throw master.notFound('customer_id', id)
  return row
}

const list = async (db, query) => {
  const paging = pagination.parse(query, SORTABLE, 'name')
  const { rows, total } = await repo.list(db, { search: query.search, paging })
  return { data: rows.map(serialize), meta: pagination.meta(paging, total) }
}

const get = async (db, id) => serialize(await load(db, id))

const create = async (db, admin, body) => {
  if (await repo.codeTaken(db, body.code)) throw fail('code', 'Kode customer sudah dipakai.')
  const id = await repo.insert(db, {
    code: body.code,
    name: body.name,
    phone: body.phone || null,
    email: body.email ? body.email.toLowerCase() : null,
    created_by: admin.id,
    updated_by: admin.id,
  })
  return get(db, id)
}

const update = async (db, admin, id, body) => {
  await load(db, id)
  const fields = { updated_by: admin.id }
  if (body.name !== undefined) fields.name = body.name
  if (body.phone !== undefined) fields.phone = body.phone || null
  if (body.email !== undefined) fields.email = body.email ? body.email.toLowerCase() : null
  await repo.update(db, id, fields)
  return get(db, id)
}

/**
 * Customer tidak boleh dihapus selama masih punya DO yang belum final atau masih punya lokasi aktif
 * (hapus lokasinya dulu, supaya tidak ada alamat tujuan yang menggantung tanpa customer).
 */
const remove = async (db, admin, id) => {
  await load(db, id)
  const openDo = await repo.findOpenDo(db, id)
  if (openDo) throw master.inUse(`Customer masih dipakai ${openDo.no} (${openDo.status}).`, { delivery_order_no: openDo.no })
  const locations = await repo.countLocations(db, id)
  if (locations > 0) throw master.inUse(`Customer masih punya ${locations} lokasi. Hapus lokasinya dulu.`, { location_count: locations })
  await master.softDelete(db, 'customers', id, admin.id)
  return { deleted: true }
}

module.exports = {
  list, get, create, update, remove,
}
