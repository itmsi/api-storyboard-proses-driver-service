const { AppError } = require('../../utils/errors')
const { wibDate } = require('../../utils/date')
const { findUnitOrdersOnDate } = require('./manage-repository')

// Tidak ada tabel penugasan unit: unit yang dipegang driver pada suatu tanggal dibaca dari DO-nya (lihat utils/driver-unit.js),
// dengan unit bawaan (units.driver_id) bila tidak ada DO. Penggantian driver/unit = DO untuk driver/unit pengganti itu.
// Aturan satu driver satu unit per tanggal dijaga di manage-service (assertDriverDayFree); aturan sebaliknya (satu unit hanya
// untuk satu driver per tanggal) dijaga di sini.

const ddmmyyyy = (date) => date.split('-').reverse().join('-')

/**
 * Dipanggil di dalam transaksi saat DO dibuat, diubah, atau dilanjutkan: unit tidak boleh sedang dipegang driver lain pada
 * tanggal kerja DO (DO driver lain dengan unit yang sama, status assigned sampai completed). Bentrok = 409 dan DO tidak berubah.
 * Kunci per unit dan tanggal menjaga dua admin yang menyimpan bersamaan.
 *
 * @returns {Promise<{ work_date: string, source: 'default'|'override' } | null>}
 *   source default = driver adalah driver bawaan unit itu; override = driver/unit pengganti. null = tanggal sudah lewat (tidak diperiksa).
 */
const ensureUnitFree = async (trx, {
  driverId, unitId, unit, workDate, exceptOrderId = null,
}) => {
  if (workDate < wibDate()) return null

  await trx.raw('SELECT pg_advisory_xact_lock(hashtext(?))', [`unit-day:${unitId}:${workDate}`])
  const other = await findUnitOrdersOnDate(trx, {
    unitId, date: workDate, exceptId: exceptOrderId, exceptDriverId: driverId,
  }).first()
  if (other) {
    throw new AppError('CONFLICT', {
      message: `Unit ${unit.plate} sudah dipegang ${other.driver_name} (${other.driver_code}) pada ${ddmmyyyy(workDate)} lewat ${other.no}. `
        + 'Gunakan unit lain, atau ubah/batalkan/onhold DO tersebut lebih dulu.',
      details: {
        reason: 'unit_sudah_ditugaskan',
        work_date: workDate,
        order: { id: other.id, no: other.no, status: other.status },
        driver: { id: other.driver_id, code: other.driver_code, name: other.driver_name },
      },
    })
  }

  const owner = await trx('units').where({ id: unitId }).first('driver_id')
  return { work_date: workDate, source: owner && owner.driver_id === driverId ? 'default' : 'override' }
}

module.exports = { ensureUnitFree }
