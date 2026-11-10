const findByClientRef = (db, userId, clientRef) => db('sync_items').where({ created_by: userId, client_ref: clientRef }).first()

/** Catat hasil satu item. Item yang sudah berhasil tidak diturunkan lagi menjadi failed. */
const record = async (db, userId, row) => {
  const existing = await findByClientRef(db, userId, row.client_ref)
  if (!existing) {
    await db('sync_items').insert({ ...row, created_by: userId, updated_by: userId })
    return
  }
  if (existing.status === 'created') return
  await db('sync_items')
    .where({ id: existing.id })
    .update({
      status: row.status,
      error: row.error,
      result_id: row.result_id,
      label: row.label,
      processed_at: db.fn.now(),
      attempts: db.raw('attempts + 1'),
      updated_by: userId,
    })
}

const touchDevice = (db, userId, deviceId) => db('devices')
  .where({ user_id: userId, device_id: deviceId })
  .update({ last_synced_at: db.fn.now(), last_seen_at: db.fn.now(), updated_by: userId })

/**
 * Item yang gagal dan belum berhasil dikirim ulang. DO yang sudah selesai/dibatalkan tidak dihitung
 * (item untuk DO terkunci tidak akan pernah berhasil, jadi tidak boleh menahan "belum tersinkron" selamanya).
 */
const listPending = (db, userId) => db('sync_items')
  .leftJoin('delivery_orders', 'delivery_orders.id', 'sync_items.delivery_order_id')
  .where({ 'sync_items.created_by': userId, 'sync_items.status': 'failed' })
  .where((q) => q.whereNull('delivery_orders.id').orWhereNotIn('delivery_orders.status', ['completed', 'cancelled']))
  .orderBy('sync_items.client_created_at', 'asc')
  .select('sync_items.type', 'sync_items.label', 'sync_items.client_created_at', 'sync_items.delivery_order_id', 'sync_items.device_id')

module.exports = {
  findByClientRef, record, touchDevice, listPending,
}
