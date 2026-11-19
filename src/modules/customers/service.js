const { auditFields } = require('../../utils/audit')
const pagination = require('../../utils/pagination')
const { fail } = require('../../utils/accounts')
const master = require('../../utils/master')
const locations = require('../locations/service')
const repo = require('./repository')

const SORTABLE = {
  name: 'customers.name', code: 'customers.code', nomor_customer: 'customers.nomor_customer', created_at: 'customers.created_at',
}

const serialize = (row) => ({
  id: row.id,
  code: row.code,
  name: row.name,
  nomor_customer: row.nomor_customer ?? null,
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
  const { rows, total } = await repo.list(db, {
    search: query.search, hasLocations: query.has_locations, hasOpenOrders: query.has_open_orders, paging,
  })
  return { data: rows.map(serialize), meta: pagination.meta(paging, total) }
}

/** Detail memuat lokasi aktif customer (bagian "Lokasi customer" di form); daftar hanya memuat location_count. */
const get = async (db, id) => ({
  ...serialize(await load(db, id)),
  locations: await locations.forCustomer(db, id),
})

/** Kesalahan validasi dari lokasi ke-N diberi awalan locations.N supaya FE tahu baris mana yang salah. */
const withPath = (err, index) => {
  if (err && err.code === 'VALIDATION_ERROR' && Array.isArray(err.details)) {
    return Object.assign(err, { details: err.details.map((d) => ({ ...d, field: `locations.${index}.${d.field}` })) })
  }
  return err
}

/**
 * Terapkan daftar lokasi pada customer: dengan id = ubah (harus milik customer ini), tanpa id = buat baru (jenis bawaan customer_site, boleh warehouse atau depot milik customer).
 * Dijalankan di transaksi yang sama dengan customernya: satu lokasi gagal = tidak ada yang tersimpan.
 */
const applyLocations = async (trx, admin, customerId, items = []) => {
  // eslint-disable-next-line no-restricted-syntax
  for (const [index, item] of items.entries()) {
    const { id: locationId, ...fields } = item
    try {
      if (locationId) {
        // eslint-disable-next-line no-await-in-loop
        await locations.assertOwned(trx, customerId, locationId)
        // eslint-disable-next-line no-await-in-loop
        await locations.update(trx, admin, locationId, fields)
      } else {
        // eslint-disable-next-line no-await-in-loop
        await locations.create(trx, admin, { type: 'customer_site', ...fields, customer_id: customerId })
      }
    } catch (err) {
      throw withPath(err, index)
    }
  }
}

const create = async (db, admin, body) => {
  if (await repo.codeTaken(db, body.code)) throw fail('code', 'Kode customer sudah dipakai.')
  const id = await db.transaction(async (trx) => {
    const created = await repo.insert(trx, {
      code: body.code,
      name: body.name,
      nomor_customer: body.nomor_customer || null,
      phone: body.phone || null,
      email: body.email ? body.email.toLowerCase() : null,
      created_by: admin.id,
      updated_by: admin.id,
    })
    await applyLocations(trx, admin, created, body.locations)
    return created
  })
  return get(db, id)
}

const update = async (db, admin, id, body) => {
  await load(db, id)
  const fields = { updated_by: admin.id }
  if (body.name !== undefined) fields.name = body.name
  if (body.nomor_customer !== undefined) fields.nomor_customer = body.nomor_customer || null
  if (body.phone !== undefined) fields.phone = body.phone || null
  if (body.email !== undefined) fields.email = body.email ? body.email.toLowerCase() : null
  await db.transaction(async (trx) => {
    await repo.update(trx, id, fields)
    await applyLocations(trx, admin, id, body.locations)
  })
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
  const locationCount = await repo.countLocations(db, id)
  if (locationCount > 0) throw master.inUse(`Customer masih punya ${locationCount} lokasi. Hapus lokasinya dulu.`, { location_count: locationCount })
  await master.softDelete(db, 'customers', id, admin.id)
  return { deleted: true }
}

module.exports = {
  list, get, create, update, remove,
}
