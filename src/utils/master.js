const { AppError } = require('./errors')

/**
 * Pembantu kecil untuk CRUD master data admin (tipe unit, unit, customer, lokasi).
 */

/** Data tidak ada atau sudah dihapus. */
const notFound = (entity, id) => new AppError('NOT_FOUND', { details: { [entity]: id } })

/** Data masih dipakai data lain sehingga tidak boleh dihapus/dinonaktifkan. Pesan tampil apa adanya ke admin. */
const inUse = (message, details) => new AppError('CONFLICT', { message, details: { reason: 'masih_dipakai', ...details } })

/** Soft delete: baris tetap ada (riwayat utuh), hilang dari daftar, dan kode/plat yang sama boleh dipakai lagi. */
const softDelete = (db, table, id, actorId) => db(table).where({ id }).update({
  is_delete: true, deleted_at: db.fn.now(), deleted_by: actorId, updated_by: actorId,
})

// DO belum final: masih bisa dikerjakan driver, jadi data master yang dirujuknya tidak boleh hilang
const OPEN_DO_STATUSES = ['assigned', 'accepted', 'loading', 'in_transit', 'handover']

module.exports = {
  notFound, inUse, softDelete, OPEN_DO_STATUSES,
}
