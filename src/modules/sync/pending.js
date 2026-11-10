const { toWib } = require('../../utils/date')
const repo = require('./repository')

/**
 * Item sync yang masih tercatat gagal di server (bahan pending_sync di bootstrap, layar Berjalan, dan logout).
 * Dipisah dari service.js supaya modul lain bisa memakainya tanpa menarik seluruh rantai service (hindari impor melingkar).
 */
const getPending = async (db, userId) => {
  const rows = await repo.listPending(db, userId)
  return rows.map((r) => ({
    type: r.type,
    label: r.label,
    client_created_at: toWib(r.client_created_at),
    delivery_order_id: r.delivery_order_id,
  }))
}

module.exports = { getPending }
