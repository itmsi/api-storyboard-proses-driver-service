const { withAuditNames } = require('../../utils/audit')
const { searchColumns } = require('../../utils/pagination')

const findByClientRef = (db, userId, clientRef) => db('media')
  .where({ captured_by: userId, client_ref: clientRef })
  .first()

const insert = async (db, row) => {
  const [created] = await db('media').insert(row).returning('*')
  return created
}

/** Media milik user ini (foto dari kamera miliknya sendiri). */
const findOwned = (db, userId, ids) => db('media').whereIn('id', ids).where({ captured_by: userId, is_delete: false })

/** Id media yang sudah dipakai di tempat lain (DO, odometer, struk, foto P2H): satu foto hanya boleh dipakai sekali. */
const findInUse = async (db, ids) => {
  const [doMedia, odometer, expenses, p2h] = await Promise.all([
    db('delivery_order_media').whereIn('media_id', ids).select('media_id'),
    db('odometer_readings').whereIn('media_id', ids).select('media_id'),
    db('expenses').whereIn('proof_media_id', ids).select('proof_media_id as media_id'),
    db('p2h_inspection_photos').whereIn('media_id', ids).select('media_id'),
  ])
  return new Set([...doMedia, ...odometer, ...expenses, ...p2h].map((r) => r.media_id))
}

/** Satu media (tanpa yang dihapus), dengan nama pengambil dan nama pembuat/pengubah. */
const findById = (db, id) => withAuditNames(
  db('media')
    .join('users as capturer', 'capturer.id', 'media.captured_by')
    .where({ 'media.id': id, 'media.is_delete': false })
    .select('media.*', 'capturer.name as captured_by_name'),
  'media'
).first()

const listAdmin = async (db, { filters, search, paging }) => {
  const filtered = () => {
    const q = db('media')
      .join('users as capturer', 'capturer.id', 'media.captured_by')
      .where('media.is_delete', false)
    if (filters.kind) q.where('media.kind', filters.kind)
    if (filters.captured_by) q.where('media.captured_by', filters.captured_by)
    if (filters.from) q.where('media.captured_at', '>=', `${filters.from}T00:00:00+07:00`)
    if (filters.to) q.where('media.captured_at', '<', db.raw("(?::date + 1)::timestamptz - interval '7 hours'", [filters.to]))
    return searchColumns(q, search, ['capturer.name', 'media.kind'])
  }
  const [{ count }] = await filtered().count('media.id as count')
  const rows = await withAuditNames(filtered(), 'media')
    .select('media.*', 'capturer.name as captured_by_name')
    .orderBy(paging.column, paging.direction)
    .orderBy('media.id')
    .limit(paging.limit)
    .offset(paging.offset)
  return { rows, total: Number(count) }
}

const softDelete = (db, id, actorId) => db('media').where({ id }).update({
  is_delete: true, deleted_at: db.fn.now(), deleted_by: actorId, updated_by: actorId,
})

module.exports = {
  findByClientRef, insert, findOwned, findInUse, findById, listAdmin, softDelete,
}
