const { auditFields } = require('../../utils/audit')
const pagination = require('../../utils/pagination')
const { fail } = require('../../utils/accounts')
const master = require('../../utils/master')
const repo = require('./repository')

const SORTABLE = {
  name: 'locations.name', type: 'locations.type', city: 'locations.city', created_at: 'locations.created_at',
}

const num = (v) => (v === null || v === undefined ? null : Number(v))

const serialize = (row) => ({
  id: row.id,
  type: row.type,
  name: row.name,
  address: row.address,
  city: row.city,
  gps: row.lat === null ? null : { lat: num(row.lat), lng: num(row.lng) },
  geofence_radius_m: row.geofence_radius_m,
  operating_hours: row.operating_hours,
  pic: row.pic_name || row.pic_phone ? { name: row.pic_name, phone: row.pic_phone } : null,
  customer: row.customer_id ? { id: row.customer_id, name: row.customer_name } : null,
  ...auditFields(row),
})

const load = async (db, id) => {
  const row = await repo.findById(db, id)
  if (!row) throw master.notFound('location_id', id)
  return row
}

/**
 * Aturan antar-field pada data GABUNGAN (data lama + perubahan):
 * - customer_site wajib punya customer yang masih ada; gudang/depot tidak boleh punya customer
 * - koordinat harus berpasangan (lat dan lng sama-sama ada atau sama-sama kosong)
 */
const checkRules = async (db, data) => {
  if (data.type === 'customer_site') {
    if (!data.customer_id) throw fail('customer_id', 'Lokasi customer wajib memilih customer.')
    if (!(await repo.findCustomer(db, data.customer_id))) throw fail('customer_id', 'Customer tidak ditemukan.')
  } else if (data.customer_id) {
    throw fail('customer_id', 'Gudang atau depot sendiri tidak boleh terkait customer.')
  }
  if ((data.lat === null || data.lat === undefined) !== (data.lng === null || data.lng === undefined)) {
    throw fail(data.lat === null || data.lat === undefined ? 'lat' : 'lng', 'Koordinat harus diisi lengkap (lat dan lng).')
  }
}

const columns = (body) => {
  const out = {};
  ['type', 'name', 'address', 'lat', 'lng', 'geofence_radius_m', 'customer_id'].forEach((k) => {
    if (body[k] !== undefined) out[k] = body[k]
  });
  ['city', 'operating_hours', 'pic_name', 'pic_phone'].forEach((k) => {
    if (body[k] !== undefined) out[k] = body[k] || null
  })
  return out
}

const list = async (db, query) => {
  const paging = pagination.parse(query, SORTABLE, 'name')
  const { rows, total } = await repo.list(db, {
    search: query.search, type: query.type, customerId: query.customer_id, paging,
  })
  return { data: rows.map(serialize), meta: pagination.meta(paging, total) }
}

const get = async (db, id) => serialize(await load(db, id))

const create = async (db, admin, body) => {
  const data = {
    customer_id: null, lat: null, lng: null, geofence_radius_m: 200, ...columns(body),
  }
  await checkRules(db, data)
  const id = await repo.insert(db, { ...data, created_by: admin.id, updated_by: admin.id })
  return get(db, id)
}

const update = async (db, admin, id, body) => {
  const current = await load(db, id)
  const changes = columns(body)
  const merged = {
    type: current.type,
    customer_id: current.customer_id,
    lat: current.lat,
    lng: current.lng,
    ...changes,
  }
  // Pindah jenis ke gudang/depot otomatis melepas customer, supaya admin tidak perlu mengirim customer_id: null
  if (changes.type && changes.type !== 'customer_site' && changes.customer_id === undefined) {
    merged.customer_id = null
    changes.customer_id = null
  }
  await checkRules(db, merged)
  await repo.update(db, id, { ...changes, updated_by: admin.id })
  return get(db, id)
}

/**
 * DO menyimpan salinan alamat (snapshot) sehingga riwayat tidak berubah; tetapi DO yang belum final
 * masih merujuk lokasi ini, jadi hapus ditolak sampai DO itu selesai atau dibatalkan.
 */
const remove = async (db, admin, id) => {
  await load(db, id)
  const openDo = await repo.findOpenDo(db, id)
  if (openDo) throw master.inUse(`Lokasi masih dipakai ${openDo.no} (${openDo.status}).`, { delivery_order_no: openDo.no })
  await master.softDelete(db, 'locations', id, admin.id)
  return { deleted: true }
}

module.exports = {
  list, get, create, update, remove,
}
