const findByClientRef = (db, userId, clientRef) => db('media')
  .where({ captured_by: userId, client_ref: clientRef })
  .first()

const insert = async (db, row) => {
  const [created] = await db('media').insert(row).returning('*')
  return created
}

/** Media milik user ini (foto dari kamera miliknya sendiri). */
const findOwned = (db, userId, ids) => db('media').whereIn('id', ids).where({ captured_by: userId })

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

module.exports = {
  findByClientRef, insert, findOwned, findInUse,
}
