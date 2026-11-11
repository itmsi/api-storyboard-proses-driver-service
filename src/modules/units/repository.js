const { withAuditNames } = require('../../utils/audit')
const { searchColumns } = require('../../utils/pagination')
const { OPEN_DO_STATUSES } = require('../../utils/master')

const base = (db) => db('units')
  .join('unit_types', 'unit_types.id', 'units.unit_type_id')
  .where({ 'units.is_delete': false })

const select = (db, query) => query.select(
  'units.id',
  'units.plate',
  'units.brand',
  'units.year',
  'units.status',
  'units.last_odometer_km',
  db.raw('units.stnk_expires_on::text as stnk_expires_on'),
  db.raw('units.kir_expires_on::text as kir_expires_on'),
  'unit_types.id as type_id',
  'unit_types.code as type_code',
  'unit_types.name as type_name',
  'units.created_at',
  'units.created_by',
  'units.updated_at',
  'units.updated_by'
)

const list = async (db, {
  search, status, unitTypeId, paging,
}) => {
  const filtered = () => {
    const q = searchColumns(base(db), search, ['units.plate', 'units.brand'])
    if (status) q.where('units.status', status)
    if (unitTypeId) q.where('units.unit_type_id', unitTypeId)
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

const findById = (db, id) => withAuditNames(select(db, base(db)).where('units.id', id), 'units').first()

const findType = (db, id) => db('unit_types').where({ id, is_delete: false }).first('id')

/** Plat sama (spasi dan huruf besar/kecil diabaikan) pada unit lain yang belum dihapus. */
const plateTaken = async (db, plate, exceptId) => {
  const q = db('units').where({ is_delete: false }).whereRaw("upper(replace(plate, ' ', '')) = ?", [plate.replace(/ /g, '')])
  if (exceptId) q.whereNot({ id: exceptId })
  return Boolean(await q.first('id'))
}

/** Pemakaian unit yang menghalangi hapus/nonaktif: DO yang belum final, dan penugasan hari ini atau yang akan datang. */
const findUsage = async (db, unitId, today) => {
  const [openDo, assignment] = await Promise.all([
    db('delivery_orders').where({ unit_id: unitId }).whereIn('status', OPEN_DO_STATUSES).first('id', 'no', 'status'),
    db('driver_unit_assignments')
      .join('drivers', 'drivers.id', 'driver_unit_assignments.driver_id')
      .join('users', 'users.id', 'drivers.user_id')
      .where({ 'driver_unit_assignments.unit_id': unitId })
      .where('driver_unit_assignments.work_date', '>=', today)
      .orderBy('driver_unit_assignments.work_date')
      .first(db.raw('driver_unit_assignments.work_date::text as work_date'), 'users.name as driver_name'),
  ])
  return { openDo, assignment }
}

const insert = async (db, row) => {
  const [created] = await db('units').insert(row).returning('id')
  return created.id
}

const update = (db, id, fields) => db('units').where({ id }).update(fields)

module.exports = {
  list, findById, findType, plateTaken, findUsage, insert, update,
}
