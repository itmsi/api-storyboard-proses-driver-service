const { AppError } = require('../../utils/errors')
const { wibDate } = require('../../utils/date')
const { DAY_BOUND_DO_STATUSES } = require('../../utils/master')
const { findDriverOrdersOnDate } = require('./manage-repository')

// Penugasan unit harian (driver_unit_assignments) hanya berupa PENGECUALIAN dari driver bawaan unit (units.driver_id) dan dibuat
// otomatis oleh DO; tidak ada endpoint tersendiri. Admin melihat hasilnya di respons DO (unit_assignment).
// Aturan: satu driver satu unit per hari, dan satu unit hanya untuk satu driver per hari
// (dijaga juga oleh indeks unik driver_unit_assignments_unit_date_uq).

const UNIT_DATE_CONSTRAINT = 'driver_unit_assignments_unit_date_uq'

const findByDriverDate = (db, driverId, date) => db('driver_unit_assignments').where({ driver_id: driverId, work_date: date }).first()

/** Penugasan unit pada tanggal tsb milik driver lain (satu unit hanya untuk satu driver per tanggal). */
const findUnitTaken = (db, unitId, date, exceptDriverId) => db('driver_unit_assignments as dua')
  .join('drivers', 'drivers.id', 'dua.driver_id')
  .join('users', 'users.id', 'drivers.user_id')
  .where({ 'dua.unit_id': unitId, 'dua.work_date': date })
  .whereNot('dua.driver_id', exceptDriverId)
  .first('dua.id', 'dua.driver_id', 'drivers.code as driver_code', 'users.name as driver_name')

const unitTaken = (unit, workDate, other) => new AppError('CONFLICT', {
  message: other
    ? `Unit ${unit.plate} sudah ditugaskan ke ${other.driver_name} (${other.driver_code}) pada ${workDate}.`
    : `Unit ${unit.plate} sudah ditugaskan ke driver lain pada ${workDate}.`,
  details: {
    reason: 'unit_sudah_ditugaskan',
    ...(other ? { assignment_id: other.id, driver: { id: other.driver_id, code: other.driver_code, name: other.driver_name } } : {}),
  },
})

/**
 * Dipanggil saat DO dibuat atau diubah: menyiapkan penugasan unit harian (driver, unit, tanggal) untuk tanggal rencana muat,
 * supaya driver langsung bisa membuat P2H di unit itu. Dijalankan di transaksi yang sama dengan DO, jadi kalau bentrok DO tidak ikut dibuat.
 *
 *  - Driver adalah driver bawaan unit itu (units.driver_id): tidak perlu baris penugasan (source: default), selama
 *    unit itu tidak dipegang driver lain lewat pengecualian pada tanggal tersebut.
 *  - Sudah ada penugasan yang sama: tidak berubah (created: false).
 *  - Belum ada: dibuat sebagai pengecualian harian (created: true), mis. driver pengganti atau unit pengganti.
 *  - Driver sudah punya penugasan unit lain pada tanggal itu:
 *      · unit lama masih dipakai DO lain (assigned/berjalan/selesai) pada tanggal itu: 409 (tidak menimpa diam-diam);
 *      · unit lama tidak dipakai DO mana pun lagi (mis. DO-nya di-onhold atau dibatalkan): penugasan dipindah ke unit baru
 *        (moved_from_unit_id), atau dihapus bila unit baru adalah unit bawaan driver.
 *  - Unit itu sudah dipegang driver lain: 409.
 *  - Tanggal sebelum hari ini: tidak disiapkan (null).
 * exceptOrderId: DO yang sedang diubah/dilanjutkan, tidak dihitung sebagai pemakai unit lama.
 */
const ensureForOrder = async (db, admin, {
  driverId, unitId, unit, workDate, exceptOrderId = null,
}) => {
  if (workDate < wibDate()) return null

  const existing = await findByDriverDate(db, driverId, workDate)
  if (existing && existing.unit_id === unitId) {
    return {
      id: existing.id, work_date: workDate, created: false, source: 'override'
    }
  }
  if (existing) {
    const stillUsed = await findDriverOrdersOnDate(db, {
      driverId, date: workDate, statuses: DAY_BOUND_DO_STATUSES, exceptId: exceptOrderId, unitId: existing.unit_id,
    }).first()
    if (stillUsed) {
      throw new AppError('CONFLICT', {
        message: `Driver sudah memegang unit lain pada ${workDate}. Gunakan unit yang sama, atau ganti driver/unit DO ini.`,
        details: { reason: 'penugasan_beda_unit', assignment_id: existing.id, work_date: workDate },
      })
    }
  }

  const other = await findUnitTaken(db, unitId, workDate, driverId)
  if (other) throw unitTaken(unit, workDate, other)

  // Driver bawaan unit ini: tidak perlu penugasan harian (pengecualian lama yang sudah tidak dipakai dibuang)
  const owner = await db('units').where({ id: unitId }).first('driver_id')
  if (owner && owner.driver_id === driverId) {
    if (existing) await db('driver_unit_assignments').where({ id: existing.id }).del()
    return {
      id: null, work_date: workDate, created: false, source: 'default', ...(existing ? { moved_from_unit_id: existing.unit_id } : {}),
    }
  }

  // Penugasan lama sudah tidak dipakai DO mana pun: pindahkan ke unit baru
  if (existing) {
    try {
      await db('driver_unit_assignments').where({ id: existing.id }).update({ unit_id: unitId, updated_by: admin.id })
    } catch (err) {
      if (err.code === '23505' && err.constraint === UNIT_DATE_CONSTRAINT) throw unitTaken(unit, workDate)
      throw err
    }
    return {
      id: existing.id, work_date: workDate, created: false, source: 'override', moved_from_unit_id: existing.unit_id,
    }
  }

  let saved
  try {
    [saved] = await db('driver_unit_assignments')
      .insert({
        driver_id: driverId, unit_id: unitId, work_date: workDate, created_by: admin.id, updated_by: admin.id,
      })
      .returning('id')
  } catch (err) {
    if (err.code === '23505' && err.constraint === UNIT_DATE_CONSTRAINT) throw unitTaken(unit, workDate)
    throw err
  }
  return {
    id: saved.id, work_date: workDate, created: true, source: 'override'
  }
}

module.exports = { ensureForOrder }
