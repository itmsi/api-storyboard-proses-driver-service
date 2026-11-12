const { AppError } = require('../../utils/errors')
const { auditFields } = require('../../utils/audit')
const { wibDate } = require('../../utils/date')
const pagination = require('../../utils/pagination')
const { fail } = require('../../utils/accounts')
const master = require('../../utils/master')
const doRepo = require('../delivery-orders/manage-repository')
const repo = require('./repository')

// Penugasan unit harian: satu driver satu unit per hari, dan satu unit hanya untuk satu driver per hari
// (dijaga juga oleh indeks unik driver_unit_assignments_unit_date_uq).
// Penugasan hari ini menjadi syarat driver membuat P2H di unit itu.

const UNIT_DATE_CONSTRAINT = 'driver_unit_assignments_unit_date_uq'

const unitTaken = (unit, workDate, other) => new AppError('CONFLICT', {
  message: other
    ? `Unit ${unit.plate} sudah ditugaskan ke ${other.driver_name} (${other.driver_code}) pada ${workDate}.`
    : `Unit ${unit.plate} sudah ditugaskan ke driver lain pada ${workDate}.`,
  details: {
    reason: 'unit_sudah_ditugaskan',
    ...(other ? { assignment_id: other.id, driver: { id: other.driver_id, code: other.driver_code, name: other.driver_name } } : {}),
  },
})

const SORTABLE = {
  driver: 'driver_user.name', plate: 'units.plate', created_at: 'dua.created_at',
}

const serialize = (row) => ({
  id: row.id,
  work_date: row.work_date,
  driver: { id: row.driver_id, code: row.driver_code, name: row.driver_name },
  unit: { id: row.unit_id, plate: row.unit_plate, type: row.unit_type },
  ...auditFields(row),
})

const load = async (db, id) => {
  const row = await repo.findById(db, id)
  if (!row) throw master.notFound('assignment_id', id)
  return row
}

/** Penugasan yang driver-nya sudah mulai bekerja dengan unit itu tidak boleh dipindah atau dicabut. */
const assertNotStarted = async (db, assignment, action) => {
  const started = await repo.hasStartedWork(db, assignment.driver_id, assignment.unit_id, assignment.work_date)
  if (started.openDo) {
    throw new AppError('CONFLICT', {
      message: `Penugasan tidak bisa ${action}: driver sedang mengerjakan ${started.openDo.no} dengan unit ini.`,
      details: { reason: 'sudah_bekerja', delivery_order_no: started.openDo.no },
    })
  }
  if (started.p2h) {
    throw new AppError('CONFLICT', {
      message: `Penugasan tidak bisa ${action}: P2H unit ini sudah dibuat pada ${assignment.work_date}.`,
      details: { reason: 'sudah_bekerja', p2h: true },
    })
  }
}

const list = async (db, query) => {
  const paging = pagination.parse(query, SORTABLE, 'driver')
  const { rows, total } = await repo.list(db, {
    date: query.date || wibDate(), driverId: query.driver_id, unitId: query.unit_id, search: query.search, paging,
  })
  return { data: rows.map(serialize), meta: pagination.meta(paging, total) }
}

const get = async (db, id) => serialize(await load(db, id))

/** Buat penugasan, atau ganti unit penugasan yang sudah ada (driver yang sama, tanggal yang sama). Idempoten. */
const assign = async (db, admin, body) => {
  if (body.work_date < wibDate()) throw fail('work_date', 'Tanggal penugasan tidak boleh sebelum hari ini.')

  const [driver, unit] = await Promise.all([doRepo.findDriver(db, body.driver_id), doRepo.findUnit(db, body.unit_id)])
  if (!driver) throw fail('driver_id', 'Driver tidak ditemukan.')
  if (driver.user_status !== 'active' || driver.driver_status !== 'active') throw fail('driver_id', 'Driver sedang dinonaktifkan.')
  if (!unit) throw fail('unit_id', 'Unit tidak ditemukan.')
  if (unit.status !== 'active') throw fail('unit_id', `Unit ${unit.plate} tidak aktif (${unit.status}).`)

  const existing = await repo.findByDriverDate(db, body.driver_id, body.work_date)
  if (existing && existing.unit_id === body.unit_id) return { result: await get(db, existing.id), created: false }
  if (existing) await assertNotStarted(db, existing, 'diganti')

  const other = await repo.findUnitTaken(db, body.unit_id, body.work_date, body.driver_id)
  if (other) throw unitTaken(unit, body.work_date, other)

  let saved
  try {
    saved = await repo.upsert(db, {
      driver_id: body.driver_id,
      unit_id: body.unit_id,
      work_date: body.work_date,
      created_by: admin.id,
      updated_by: admin.id,
    })
  } catch (err) {
    // Admin lain baru saja menugaskan unit ini di tanggal yang sama
    if (err.code === '23505' && err.constraint === UNIT_DATE_CONSTRAINT) throw unitTaken(unit, body.work_date)
    throw err
  }
  return { result: await get(db, saved.id), created: Boolean(saved.inserted) }
}

const remove = async (db, admin, id) => {
  const row = await load(db, id)
  await assertNotStarted(db, row, 'dicabut')
  await repo.remove(db, id)
  return { deleted: true }
}

module.exports = {
  list, get, assign, remove,
}
