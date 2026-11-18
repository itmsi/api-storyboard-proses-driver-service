const { auditFields } = require('../../utils/audit')
const { wibDate } = require('../../utils/date')
const { addDays } = require('../../utils/expiry')
const pagination = require('../../utils/pagination')
const { normalizePlate } = require('../../utils/plate')
const { fail } = require('../../utils/accounts')
const master = require('../../utils/master')
const repo = require('./repository')

const SORTABLE = {
  plate: 'units.plate',
  status: 'units.status',
  created_at: 'units.created_at',
  year: 'units.year',
  type: 'units.unit_type',
  stnk_expires_on: 'units.stnk_expires_on',
  kir_expires_on: 'units.kir_expires_on',
}

const serialize = (row) => {
  const today = wibDate()
  return {
    id: row.id,
    plate: row.plate,
    unit_type: row.unit_type,
    max_load_kg: row.max_load_kg,
    brand: row.brand,
    year: row.year,
    vin_number: row.vin_number,
    status: row.status,
    last_odometer_km: row.last_odometer_km,
    driver_id: row.driver_id,
    driver: row.driver_id ? { id: row.driver_id, code: row.default_driver_code, name: row.default_driver_name } : null, // driver bawaan unit
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

/** Tipe unit teks bebas: spasi berlebih dirapikan. */
const normalizeType = (input) => String(input).trim().replace(/\s+/g, ' ')

const validPlate = async (db, input, exceptId = null) => {
  const plate = normalizePlate(input)
  if (!plate) throw fail('plate', 'Format plat tidak valid (contoh: B 9123 KZ).')
  if (await repo.plateTaken(db, plate, exceptId)) throw fail('plate', 'Plat sudah dipakai unit lain.')
  return plate
}

/**
 * Driver bawaan: boleh kosong (null). Driver harus ada dan aktif, dan satu driver hanya bisa menjadi bawaan di satu unit
 * (menjaga aturan satu driver satu unit per hari).
 */
const validDefaultDriver = async (db, driverId, exceptUnitId = null) => {
  if (driverId === null) return null
  const driver = await repo.findDriver(db, driverId)
  if (!driver) throw fail('driver_id', 'Driver tidak ditemukan.')
  if (driver.user_status !== 'active' || driver.driver_status !== 'active') throw fail('driver_id', `Driver ${driver.name} sedang dinonaktifkan.`)
  const other = await repo.findUnitOfDefaultDriver(db, driverId, exceptUnitId)
  if (other) throw fail('driver_id', `Driver ${driver.name} sudah menjadi driver bawaan unit ${other.plate}. Satu driver hanya bisa menjadi driver bawaan satu unit.`)
  return driverId
}

/** VIN dinormalkan huruf besar, kosong = tanpa VIN. Unik di antara unit yang belum dihapus. */
const validVin = async (db, input, exceptId = null) => {
  if (input === null || input === undefined || input === '') return null
  const vin = String(input).trim().toUpperCase()
  const other = await repo.vinTaken(db, vin, exceptId)
  if (other) throw fail('vin_number', `Nomor rangka (VIN) sudah dipakai unit ${other.plate}.`)
  return vin
}

/** Unit yang sedang dipakai DO yang belum final tidak boleh dihapus atau dinonaktifkan. */
const assertNotInUse = async (db, id, action) => {
  const openDo = await repo.findUsage(db, id)
  if (openDo) {
    throw master.inUse(`Unit tidak bisa ${action}: masih dipakai ${openDo.no} (${openDo.status}).`, { delivery_order_id: openDo.id, delivery_order_no: openDo.no })
  }
}

const list = async (db, query) => {
  const paging = pagination.parse(query, SORTABLE, 'plate')
  const { rows, total } = await repo.list(db, {
    search: query.search,
    status: query.status,
    unitType: query.unit_type,
    defaultDriverId: query.driver_id,
    hasDriver: query.has_driver,
    stnkStatus: query.stnk_status,
    kirStatus: query.kir_status,
    dates: { today: wibDate(), soon: addDays(wibDate(), query.expiring_days) },
    paging,
  })
  return { data: rows.map(serialize), meta: pagination.meta(paging, total) }
}

const get = async (db, id) => serialize(await load(db, id))

const create = async (db, admin, body) => {
  const plate = await validPlate(db, body.plate)
  const defaultDriverId = body.driver_id === undefined ? null : await validDefaultDriver(db, body.driver_id)
  const id = await repo.insert(db, {
    plate,
    unit_type: normalizeType(body.unit_type),
    max_load_kg: body.max_load_kg ?? null,
    driver_id: defaultDriverId,
    brand: body.brand || null,
    year: body.year ?? null,
    vin_number: await validVin(db, body.vin_number),
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
  if (body.unit_type !== undefined) fields.unit_type = normalizeType(body.unit_type)
  if (body.vin_number !== undefined) fields.vin_number = await validVin(db, body.vin_number, id)
  if (body.driver_id !== undefined) fields.driver_id = await validDefaultDriver(db, body.driver_id, id)
  if (body.status !== undefined && body.status !== 'active' && current.status === 'active') {
    await assertNotInUse(db, id, 'dinonaktifkan')
  }
  ['brand', 'stnk_expires_on', 'kir_expires_on'].forEach((k) => {
    if (body[k] !== undefined) fields[k] = body[k] || null
  });
  ['year', 'last_odometer_km', 'max_load_kg'].forEach((k) => {
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
