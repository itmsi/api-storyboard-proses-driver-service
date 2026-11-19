const { withAuditNames } = require('../../utils/audit')
const { searchColumns } = require('../../utils/pagination')
const { OPEN_DO_STATUSES } = require('../../utils/master')
const { applyExpiry } = require('../../utils/expiry')

const base = (db) => db('units')
  .leftJoin('drivers as default_driver', 'default_driver.id', 'units.driver_id')
  .leftJoin('users as default_driver_user', 'default_driver_user.id', 'default_driver.user_id')
  .where({ 'units.is_delete': false })

const select = (db, query) => query.select(
  'units.id',
  'units.plate',
  'units.brand',
  'units.year',
  'units.vin_number',
  'units.status',
  'units.last_odometer_km',
  db.raw('units.stnk_expires_on::text as stnk_expires_on'),
  db.raw('units.kir_expires_on::text as kir_expires_on'),
  'units.unit_type',
  'units.max_load_kg',
  'units.driver_id',
  'units.driver_assigned_at',
  'default_driver.code as default_driver_code',
  'default_driver_user.name as default_driver_name',
  'units.created_at',
  'units.created_by',
  'units.updated_at',
  'units.updated_by'
)

const list = async (db, {
  search, status, unitType, brand, defaultDriverId, hasDriver, stnkStatus, kirStatus, dates, paging,
}) => {
  const filtered = () => {
    const q = searchColumns(base(db), search, ['units.plate', 'units.brand', 'units.vin_number', 'units.unit_type'])
    if (status) q.where('units.status', status)
    if (unitType) q.whereRaw('lower(units.unit_type) = ?', [unitType.toLowerCase()])
    if (brand) q.whereRaw('lower(units.brand) = ?', [brand.toLowerCase()])
    if (defaultDriverId) q.where('units.driver_id', defaultDriverId)
    if (hasDriver === true) q.whereNotNull('units.driver_id')
    if (hasDriver === false) q.whereNull('units.driver_id')
    applyExpiry(q, 'units.stnk_expires_on', stnkStatus, dates)
    applyExpiry(q, 'units.kir_expires_on', kirStatus, dates)
    return q
  }
  const [{ count }] = await filtered().count('units.id as count')
  const rows = await withAuditNames(select(db, filtered()), 'units')
    .orderBy(paging.column, paging.direction)
    .orderBy('units.id')
    .limit(paging.limit)
    .offset(paging.offset)
  return { rows, total: Number(count) }
}

/** DO yang sedang berjalan dengan unit ini (diterima driver dan belum selesai), bila ada. */
const findRunningOrder = (db, unitId) => db('delivery_orders')
  .where({ unit_id: unitId })
  .whereIn('status', ['accepted', 'loading', 'in_transit', 'handover'])
  .orderBy('started_at', 'desc')
  .first('id', 'no', 'status')

const findById = (db, id) => withAuditNames(select(db, base(db)).where('units.id', id), 'units').first()

/** Driver yang boleh jadi driver bawaan: ada dan aktif (akun dan profil kerja). */
const findDriver = (db, id) => db('drivers')
  .join('users', 'users.id', 'drivers.user_id')
  .where({ 'drivers.id': id, 'drivers.is_delete': false, 'users.is_delete': false })
  .first('drivers.id', 'drivers.code', 'users.name', 'users.status as user_status', 'drivers.status as driver_status')

/** Unit lain (belum dihapus) yang sudah memakai driver ini sebagai driver bawaan. */
const findUnitOfDefaultDriver = (db, driverId, exceptUnitId) => {
  const q = db('units').where({ driver_id: driverId, is_delete: false })
  if (exceptUnitId) q.whereNot({ id: exceptUnitId })
  return q.first('id', 'plate')
}

/** VIN sama pada unit lain yang belum dihapus. */
const vinTaken = async (db, vin, exceptId) => {
  const q = db('units').where({ vin_number: vin, is_delete: false })
  if (exceptId) q.whereNot({ id: exceptId })
  return q.first('id', 'plate')
}

/** Plat sama (spasi dan huruf besar/kecil diabaikan) pada unit lain yang belum dihapus. */
const plateTaken = async (db, plate, exceptId) => {
  const q = db('units').where({ is_delete: false }).whereRaw("upper(replace(plate, ' ', '')) = ?", [plate.replace(/ /g, '')])
  if (exceptId) q.whereNot({ id: exceptId })
  return Boolean(await q.first('id'))
}

/** Pemakaian unit yang menghalangi hapus/nonaktif: DO yang belum final. */
const findUsage = (db, unitId) => db('delivery_orders').where({ unit_id: unitId, is_delete: false }).whereIn('status', OPEN_DO_STATUSES).first('id', 'no', 'status')

const insert = async (db, row) => {
  const [created] = await db('units').insert(row).returning('id')
  return created.id
}

const update = (db, id, fields) => db('units').where({ id }).update(fields)

module.exports = {
  findRunningOrder, list, findById, findDriver, findUnitOfDefaultDriver, plateTaken, vinTaken, findUsage, insert, update,
}
