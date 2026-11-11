const { withAuditNames } = require('../../utils/audit')
const { searchColumns } = require('../../utils/pagination')

const base = (db) => db('driver_unit_assignments as dua')
  .join('drivers', 'drivers.id', 'dua.driver_id')
  .join('users as driver_user', 'driver_user.id', 'drivers.user_id')
  .join('units', 'units.id', 'dua.unit_id')
  .join('unit_types', 'unit_types.id', 'units.unit_type_id')

const select = (db, query) => query.select(
  'dua.id',
  db.raw('dua.work_date::text as work_date'),
  'dua.driver_id',
  'dua.unit_id',
  'drivers.code as driver_code',
  'driver_user.name as driver_name',
  'units.plate as unit_plate',
  'unit_types.name as unit_type',
  'dua.created_at',
  'dua.created_by',
  'dua.updated_at',
  'dua.updated_by'
)

const list = async (db, {
  date, driverId, unitId, search, paging,
}) => {
  const filtered = () => {
    const q = searchColumns(base(db).where('dua.work_date', date), search, ['driver_user.name', 'drivers.code', 'units.plate'])
    if (driverId) q.where('dua.driver_id', driverId)
    if (unitId) q.where('dua.unit_id', unitId)
    return q
  }
  const [{ count }] = await filtered().count('dua.id as count')
  // withAuditNames menempelkan nama pembuat/pengubah lewat kolom created_by/updated_by milik tabel `dua`
  const rows = await withAuditNames(select(db, filtered()), 'dua')
    .orderBy(paging.column, paging.direction)
    .orderBy('dua.id')
    .limit(paging.limit)
    .offset(paging.offset)
  return { rows, total: Number(count) }
}

const findById = (db, id) => withAuditNames(select(db, base(db)).where('dua.id', id), 'dua').first()

const findByDriverDate = (db, driverId, date) => db('driver_unit_assignments').where({ driver_id: driverId, work_date: date }).first()

/**
 * Driver sudah mulai bekerja dengan unit itu pada tanggal tsb: sudah membuat P2H di unit itu,
 * atau punya DO yang sedang berjalan dengan unit itu. Penugasan tidak boleh dicabut/dipindah lagi.
 */
const hasStartedWork = async (db, driverId, unitId, date) => {
  const [p2h, openDo] = await Promise.all([
    db('p2h_inspections').where({
      checked_by: driverId, unit_id: unitId, inspection_date: date, is_delete: false
    }).first('id'),
    db('delivery_orders').where({ driver_id: driverId, unit_id: unitId }).whereIn('status', ['accepted', 'loading', 'in_transit', 'handover']).first('id', 'no'),
  ])
  return { p2h: Boolean(p2h), openDo: openDo || null }
}

const upsert = async (db, row) => {
  const [saved] = await db('driver_unit_assignments')
    .insert(row)
    .onConflict(['driver_id', 'work_date'])
    .merge({ unit_id: row.unit_id, updated_by: row.updated_by })
    .returning(['id', db.raw('(xmax = 0) as inserted')])
  return saved
}

const remove = (db, id) => db('driver_unit_assignments').where({ id }).delete()

module.exports = {
  list, findById, findByDriverDate, hasStartedWork, upsert, remove,
}
