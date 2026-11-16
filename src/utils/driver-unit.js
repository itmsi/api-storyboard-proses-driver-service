const { holdsOnDateSql, doWorkDateSql } = require('./master')

/**
 * Unit yang dipegang seorang driver pada tanggal kerja tertentu. Tidak ada tabel penugasan: semuanya dibaca dari DO dan unit bawaan.
 *  1. DO driver itu pada tanggal tersebut (status yang memakai hari kerja: assigned sampai completed, bukan onhold/cancelled),
 *     atau DO yang masih berjalan dari tanggal sebelumnya (menahan unitnya sampai selesai): unit DO-nya.
 *     Bila bukan unit bawaannya, ini unit pengganti (source: override).
 *  2. Selain itu unit yang driver-nya diset sebagai driver bawaan (units.driver_id), kecuali pada tanggal itu unit tersebut
 *     dipegang driver lain lewat DO (driver bawaan berhalangan, unit dipakai pengganti).
 *
 * @returns {Promise<{ id: string, plate: string, type: string, source: 'override'|'default' } | null>}
 */
const findEffectiveUnit = async (db, driverId, workDate) => {
  const order = await db('delivery_orders')
    .join('units', 'units.id', 'delivery_orders.unit_id')
    .where({ 'delivery_orders.driver_id': driverId, 'units.is_delete': false })
    .whereRaw(holdsOnDateSql('delivery_orders', '?::date'), [workDate, workDate])
    // DO pada tanggal itu lebih dulu, lalu DO lintas hari yang masih berjalan
    .orderByRaw(`(${doWorkDateSql('delivery_orders')} = ?::date) DESC`, [workDate])
    .orderBy('delivery_orders.created_at')
    .first('units.id', 'units.plate', 'units.unit_type as type', 'units.driver_id as default_driver_id')
  if (order) {
    const { default_driver_id: owner, ...unit } = order
    return { ...unit, source: owner === driverId ? 'default' : 'override' }
  }

  const fallback = await db('units')
    .where({ 'units.driver_id': driverId, 'units.is_delete': false })
    .whereNotExists(function takenByOther() {
      this.select(db.raw('1')).from('delivery_orders as other')
        .whereRaw('other.unit_id = units.id')
        .whereRaw(holdsOnDateSql('other', '?::date'), [workDate, workDate])
        .whereNot('other.driver_id', driverId)
    })
    .first('units.id', 'units.plate', 'units.unit_type as type')
  return fallback ? { ...fallback, source: 'default' } : null
}

module.exports = { findEffectiveUnit }
