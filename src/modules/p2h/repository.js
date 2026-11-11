const { withAuditNames } = require('../../utils/audit')

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
  .where({ is_active: true })
  .orderBy('sort_order')
  .select('code', 'label', 'hint', 'is_critical')

const findCurrent = (db, unitId, date) => withAuditNames(
  db('p2h_inspections')
    .join('drivers', 'drivers.id', 'p2h_inspections.checked_by')
    .join('users', 'users.id', 'drivers.user_id')
    .where({ 'p2h_inspections.unit_id': unitId, 'p2h_inspections.inspection_date': date })
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
  .where({ 'p2h_inspections.unit_id': unitId, 'p2h_inspections.inspection_date': date })
  .whereNotNull('p2h_inspections.superseded_at')
  .whereNotNull('p2h_inspections.recheck_requested_at')
  .orderBy('p2h_inspections.superseded_at', 'desc')
  .select('p2h_inspections.id', 'p2h_inspections.status', 'p2h_inspections.checked_at', 'users.name as checked_by_name')
  .first()

const findByClientRef = (db, driverId, clientRef) => db('p2h_inspections')
  .where({ checked_by: driverId, client_ref: clientRef })
  .first()

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
