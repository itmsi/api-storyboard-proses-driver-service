/**
 * Unit yang dipegang seorang driver pada tanggal kerja tertentu:
 *  1. Pengecualian harian (driver_unit_assignments), mis. unit pengganti: menang bila ada.
 *  2. Selain itu unit yang driver-nya diset sebagai driver bawaan (units.driver_id), kecuali pada tanggal itu
 *     unit tersebut dipegang driver lain lewat pengecualian (driver bawaan berhalangan, unit dipakai pengganti).
 *
 * @returns {Promise<{ id: string, plate: string, type: string, source: 'override'|'default' } | null>}
 */
const findEffectiveUnit = async (db, driverId, workDate) => {
  const override = await db('driver_unit_assignments')
    .join('units', 'units.id', 'driver_unit_assignments.unit_id')
    .where({ 'driver_unit_assignments.driver_id': driverId, 'driver_unit_assignments.work_date': workDate, 'units.is_delete': false })
    .first('units.id', 'units.plate', 'units.unit_type as type')
  if (override) return { ...override, source: 'override' }

  const fallback = await db('units')
    .where({ 'units.driver_id': driverId, 'units.is_delete': false })
    .whereNotExists(function takenByOther() {
      this.select(db.raw('1')).from('driver_unit_assignments as other')
        .whereRaw('other.unit_id = units.id')
        .where('other.work_date', workDate)
        .whereNot('other.driver_id', driverId)
    })
    .first('units.id', 'units.plate', 'units.unit_type as type')
  return fallback ? { ...fallback, source: 'default' } : null
}

module.exports = { findEffectiveUnit }
