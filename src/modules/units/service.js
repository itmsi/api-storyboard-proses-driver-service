const { auditFields } = require('../../utils/audit')
const { wibDate } = require('../../utils/date')
const pagination = require('../../utils/pagination')
const { normalizePlate } = require('../../utils/plate')
const { fail } = require('../../utils/accounts')
const master = require('../../utils/master')
const repo = require('./repository')

const SORTABLE = {
  plate: 'units.plate', status: 'units.status', created_at: 'units.created_at', year: 'units.year', type: 'unit_types.name',
}

const serialize = (row) => {
  const today = wibDate()
  return {
    id: row.id,
    plate: row.plate,
    type: { id: row.type_id, code: row.type_code, name: row.type_name },
    brand: row.brand,
    year: row.year,
    status: row.status,
    last_odometer_km: row.last_odometer_km,
    stnk_expires_on: row.stnk_expires_on,
    kir_expires_on: row.kir_expires_on,
    // Dokumen kedaluwarsa ditandai agar admin bisa menyaringnya; tidak memblokir pemakaian unit
    stnk_expired: Boolean(row.stnk_expires_on && row.stnk_expires_on < today),
    kir_expired: Boolean(row.kir_expires_on && row.kir_expires_on < today),
    ...auditFields(row),
  }
}

const load = async (db, id) => {
  const row = await repo.findById(db, id)
  if (!row) throw master.notFound('unit_id', id)
  return row
}

const validPlate = async (db, input, exceptId = null) => {
  const plate = normalizePlate(input)
  if (!plate) throw fail('plate', 'Format plat tidak valid (contoh: B 9123 KZ).')
  if (await repo.plateTaken(db, plate, exceptId)) throw fail('plate', 'Plat sudah dipakai unit lain.')
  return plate
}

const validType = async (db, id) => {
  if (!(await repo.findType(db, id))) throw fail('unit_type_id', 'Tipe unit tidak ditemukan.')
  return id
}

/** Unit yang sedang dipakai (DO belum final / penugasan hari ini dan ke depan) tidak boleh dihapus atau dinonaktifkan. */
const assertNotInUse = async (db, id, action) => {
  const { openDo, assignment } = await repo.findUsage(db, id, wibDate())
  if (openDo) {
    throw master.inUse(`Unit tidak bisa ${action}: masih dipakai ${openDo.no} (${openDo.status}).`, { delivery_order_id: openDo.id, delivery_order_no: openDo.no })
  }
  if (assignment) {
    throw master.inUse(
      `Unit tidak bisa ${action}: masih ditugaskan ke ${assignment.driver_name} pada ${assignment.work_date}.`,
      { work_date: assignment.work_date, driver_name: assignment.driver_name }
    )
  }
}

const list = async (db, query) => {
  const paging = pagination.parse(query, SORTABLE, 'plate')
  const { rows, total } = await repo.list(db, {
    search: query.search, status: query.status, unitTypeId: query.unit_type_id, paging,
  })
  return { data: rows.map(serialize), meta: pagination.meta(paging, total) }
}

const get = async (db, id) => serialize(await load(db, id))

const create = async (db, admin, body) => {
  const plate = await validPlate(db, body.plate)
  await validType(db, body.unit_type_id)
  const id = await repo.insert(db, {
    plate,
    unit_type_id: body.unit_type_id,
    brand: body.brand || null,
    year: body.year ?? null,
    last_odometer_km: body.last_odometer_km ?? null,
    status: body.status || 'active',
    stnk_expires_on: body.stnk_expires_on || null,
    kir_expires_on: body.kir_expires_on || null,
    created_by: admin.id,
    updated_by: admin.id,
  })
  return get(db, id)
}

const update = async (db, admin, id, body) => {
  const current = await load(db, id)
  const fields = { updated_by: admin.id }

  if (body.plate !== undefined) fields.plate = await validPlate(db, body.plate, id)
  if (body.unit_type_id !== undefined) fields.unit_type_id = await validType(db, body.unit_type_id)
  if (body.status !== undefined && body.status !== 'active' && current.status === 'active') {
    await assertNotInUse(db, id, 'dinonaktifkan')
  }
  ['brand', 'stnk_expires_on', 'kir_expires_on'].forEach((k) => {
    if (body[k] !== undefined) fields[k] = body[k] || null
  });
  ['year', 'last_odometer_km'].forEach((k) => {
    if (body[k] !== undefined) fields[k] = body[k]
  })
  if (body.status !== undefined) fields.status = body.status

  await repo.update(db, id, fields)
  return get(db, id)
}

const remove = async (db, admin, id) => {
  await load(db, id)
  await assertNotInUse(db, id, 'dihapus')
  await master.softDelete(db, 'units', id, admin.id)
  return { deleted: true }
}

module.exports = {
  list, get, create, update, remove,
}
