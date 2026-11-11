const { withAuditNames } = require('../../utils/audit')
const { searchColumns } = require('../../utils/pagination')

const findUnit = (db, unitId) => db('units')
  .join('unit_types', 'unit_types.id', 'units.unit_type_id')
  .where({ 'units.id': unitId, 'units.is_delete': false })
  .select('units.id', 'units.plate', 'unit_types.name as type')
  .first()

/** Driver hanya boleh mengakses unit yang ditugaskan kepadanya pada tanggal tsb. */
const hasAssignment = async (db, driverId, unitId, workDate) => {
  const row = await db('driver_unit_assignments')
    .where({ driver_id: driverId, unit_id: unitId, work_date: workDate })
    .first('id')
  return Boolean(row)
}

const getCheckItems = (db) => db('p2h_check_items')
  .where({ is_active: true, is_delete: false })
  .orderBy('sort_order')
  .select('code', 'label', 'hint', 'is_critical')

const findCurrent = (db, unitId, date) => withAuditNames(
  db('p2h_inspections')
    .join('drivers', 'drivers.id', 'p2h_inspections.checked_by')
    .join('users', 'users.id', 'drivers.user_id')
    .where({ 'p2h_inspections.unit_id': unitId, 'p2h_inspections.inspection_date': date, 'p2h_inspections.is_delete': false })
    .whereNull('p2h_inspections.superseded_at')
    .select(
      'p2h_inspections.*',
      'users.name as checked_by_name',
      db.raw('p2h_inspections.inspection_date::text as inspection_date_text')
    ),
  'p2h_inspections'
).first()

/** P2H hari ini yang digantikan karena admin meminta ulang (ada recheck_requested_at). */
const findSuperseded = (db, unitId, date) => db('p2h_inspections')
  .join('drivers', 'drivers.id', 'p2h_inspections.checked_by')
  .join('users', 'users.id', 'drivers.user_id')
  .where({ 'p2h_inspections.unit_id': unitId, 'p2h_inspections.inspection_date': date, 'p2h_inspections.is_delete': false })
  .whereNotNull('p2h_inspections.superseded_at')
  .whereNotNull('p2h_inspections.recheck_requested_at')
  .orderBy('p2h_inspections.superseded_at', 'desc')
  .select('p2h_inspections.id', 'p2h_inspections.status', 'p2h_inspections.checked_at', 'users.name as checked_by_name')
  .first()

const findByClientRef = (db, driverId, clientRef) => db('p2h_inspections')
  .where({ checked_by: driverId, client_ref: clientRef })
  .first()

/** Daftar P2H untuk admin (tanpa yang dihapus). */
const listAdmin = async (db, { filters, search, paging }) => {
  const filtered = () => {
    const q = db('p2h_inspections')
      .join('units', 'units.id', 'p2h_inspections.unit_id')
      .join('unit_types', 'unit_types.id', 'units.unit_type_id')
      .join('drivers', 'drivers.id', 'p2h_inspections.checked_by')
      .join('users as driver_user', 'driver_user.id', 'drivers.user_id')
      .where('p2h_inspections.is_delete', false)
    if (filters.unit_id) q.where('p2h_inspections.unit_id', filters.unit_id)
    if (filters.driver_id) q.where('p2h_inspections.checked_by', filters.driver_id)
    if (filters.status) q.where('p2h_inspections.status', filters.status)
    if (filters.from) q.where('p2h_inspections.inspection_date', '>=', filters.from)
    if (filters.to) q.where('p2h_inspections.inspection_date', '<=', filters.to)
    return searchColumns(q, search, ['units.plate', 'driver_user.name', 'drivers.code'])
  }
  const [{ count }] = await filtered().count('p2h_inspections.id as count')
  const rows = await withAuditNames(filtered(), 'p2h_inspections')
    .select(
      'p2h_inspections.*',
      'units.plate',
      'unit_types.name as unit_type',
      'driver_user.name as checked_by_name',
      db.raw('p2h_inspections.inspection_date::text as inspection_date_text')
    )
    .orderBy(paging.column, paging.direction)
    .orderBy('p2h_inspections.id')
    .limit(paging.limit)
    .offset(paging.offset)
  return { rows, total: Number(count) }
}

/** Satu P2H berdasarkan id (tanpa yang dihapus), beserta unit dan pemeriksa. */
const findById = (db, id) => withAuditNames(
  db('p2h_inspections')
    .join('units', 'units.id', 'p2h_inspections.unit_id')
    .join('unit_types', 'unit_types.id', 'units.unit_type_id')
    .join('drivers', 'drivers.id', 'p2h_inspections.checked_by')
    .join('users as driver_user', 'driver_user.id', 'drivers.user_id')
    .where({ 'p2h_inspections.id': id, 'p2h_inspections.is_delete': false })
    .select(
      'p2h_inspections.*',
      'units.plate',
      'unit_types.name as unit_type',
      'driver_user.name as checked_by_name',
      db.raw('p2h_inspections.inspection_date::text as inspection_date_text')
    ),
  'p2h_inspections'
).first()

const getItemRows = (db, inspectionId) => db('p2h_inspection_items').where({ inspection_id: inspectionId })

const updateItem = (db, inspectionId, code, fields) => db('p2h_inspection_items').where({ inspection_id: inspectionId, item_code: code }).update(fields)

const updateInspection = (db, id, fields) => db('p2h_inspections').where({ id }).update(fields)

const softDelete = (db, id, actorId) => db('p2h_inspections').where({ id }).update({
  is_delete: true, deleted_at: db.fn.now(), deleted_by: actorId, updated_by: actorId,
})

const getCriticalCodes = (db) => db('p2h_check_items').where({ is_critical: true }).pluck('code')

const getItems = (db, inspectionId) => db('p2h_inspection_items')
  .join('p2h_check_items', 'p2h_check_items.code', 'p2h_inspection_items.item_code')
  .where({ inspection_id: inspectionId })
  .orderBy('p2h_check_items.sort_order')
  .select('item_code as code', 'p2h_inspection_items.label', 'result', 'description')

const getPhotos = (db, inspectionId) => db('p2h_inspection_photos')
  .join('media', 'media.id', 'p2h_inspection_photos.media_id')
  .where({ inspection_id: inspectionId })
  .select('media.*', 'p2h_inspection_photos.side as photo_side')

/** Media p2h_body milik user ini, untuk validasi body_photo_ids. */
const findBodyMedia = (db, userId, ids) => db('media')
  .whereIn('id', ids)
  .where({ captured_by: userId, kind: 'p2h_body' })
  .select('id', 'side')

const insertInspection = async (trx, row, items, photos) => {
  const [inspection] = await trx('p2h_inspections').insert(row).returning('*')
  await trx('p2h_inspection_items').insert(items.map((i) => ({ ...i, inspection_id: inspection.id })))
  await trx('p2h_inspection_photos').insert(photos.map((p) => ({ ...p, inspection_id: inspection.id })))
  return inspection
}

/** Tandai P2H aktif sebagai digantikan karena admin meminta ulang; driver lalu membuat P2H baru. */
const markRecheck = (db, inspectionId, adminId, note) => db('p2h_inspections')
  .where({ id: inspectionId })
  .whereNull('superseded_at')
  .update({
    superseded_at: db.fn.now(),
    recheck_requested_by: adminId,
    recheck_requested_at: db.fn.now(),
    recheck_note: note,
    updated_by: adminId,
  })

module.exports = {
  listAdmin,
  findById,
  getItemRows,
  updateItem,
  updateInspection,
  softDelete,
  getCriticalCodes,
  markRecheck,
  findUnit,
  hasAssignment,
  getCheckItems,
  findCurrent,
  findSuperseded,
  findByClientRef,
  getItems,
  getPhotos,
  findBodyMedia,
  insertInspection,
}
