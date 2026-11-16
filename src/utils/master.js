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

// DO belum final: masih bisa dikerjakan driver (onhold: bisa dilanjutkan lagi), jadi data master yang dirujuknya tidak boleh hilang
const OPEN_DO_STATUSES = ['assigned', 'onhold', 'accepted', 'loading', 'in_transit', 'handover']

// DO yang "memakai" hari kerja driver pada tanggalnya: driver tidak boleh mendapat DO lain dengan unit berbeda di tanggal itu.
// onhold dan cancelled tidak dihitung (DO onhold melepaskan hari kerja driver).
const DAY_BOUND_DO_STATUSES = ['assigned', 'accepted', 'loading', 'in_transit', 'handover', 'completed']

// DO yang sudah diterima driver dan masih berjalan: tetap menahan unitnya walau tanggal kerjanya sudah lewat (mis. direncanakan kemarin, masih in_transit hari ini)
const RUNNING_DO_STATUSES = ['accepted', 'loading', 'in_transit', 'handover']

const DAY_BOUND_SQL = DAY_BOUND_DO_STATUSES.map((s) => `'${s}'`).join(', ')

/**
 * Tanggal kerja DO (WIB): tanggal rencana muat, atau tanggal DO ditugaskan bila tanpa rencana muat.
 * alias = nama/alias tabel delivery_orders di query.
 */
const doWorkDateSql = (alias = 'delivery_orders') => `(coalesce(${alias}.planned_load_at, ${alias}.assigned_at) AT TIME ZONE 'Asia/Jakarta')::date`

const RUNNING_SQL = RUNNING_DO_STATUSES.map((s) => `'${s}'`).join(', ')

/**
 * Kondisi SQL "DO ini memegang driver dan unitnya pada tanggal kerja X" (X = ekspresi tanggal, mis. '?::date'):
 *  - DO pada tanggal X yang berstatus DAY_BOUND_DO_STATUSES (assigned sampai completed), atau
 *  - DO yang sudah diterima dan masih berjalan (RUNNING_DO_STATUSES) dari tanggal sebelum X: tetap menahan unitnya sampai selesai.
 */
const holdsOnDateSql = (alias, dateExpr) => `((${alias}.status IN (${DAY_BOUND_SQL}) AND ${doWorkDateSql(alias)} = ${dateExpr})
  OR (${alias}.status IN (${RUNNING_SQL}) AND ${doWorkDateSql(alias)} < ${dateExpr}))`

module.exports = {
  notFound, inUse, softDelete, OPEN_DO_STATUSES, DAY_BOUND_DO_STATUSES, RUNNING_DO_STATUSES, DAY_BOUND_SQL, doWorkDateSql, holdsOnDateSql,
}
