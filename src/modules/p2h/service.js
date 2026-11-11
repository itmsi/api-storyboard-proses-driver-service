const { AppError } = require('../../utils/errors')
const { auditFields } = require('../../utils/audit')
const { toWib, wibDate, endOfWibDay } = require('../../utils/date')
const { resolveSettings } = require('../app/settings')
const { serializeMedia } = require('../media/serializer')
const repo = require('./repository')

const unitRef = (unit) => ({ id: unit.id, plate: unit.plate, type: unit.type })

const gpsOf = (row) => (row.lat === null ? null : {
  lat: Number(row.lat),
  lng: Number(row.lng),
  ...(row.gps_accuracy_m === null ? {} : { accuracy_m: Number(row.gps_accuracy_m) }),
})

/**
 * Ringkasan P2H sebuah unit pada tanggal tertentu, untuk modul lain (DO, bootstrap) tanpa memuat foto/item.
 * status: belum | layak | catatan | tidak_layak. 'belum' + recheck_requested bila admin meminta P2H ulang.
 */
const getStatus = async (db, unitId, date) => {
  const current = await repo.findCurrent(db, unitId, date)
  if (current) {
    return {
      status: current.status,
      can_operate: current.can_operate,
      p2h_id: current.id,
      checked_by: current.checked_by_name,
      checked_at: toWib(current.checked_at),
    }
  }
  const previous = await repo.findSuperseded(db, unitId, date)
  return { status: 'belum', can_operate: false, ...(previous ? { recheck_requested: true } : {}) }
}

const invalid = (field, message) => new AppError('VALIDATION_ERROR', { details: [{ field, message }] })

/** Unit harus ada dan ditugaskan ke driver ini hari ini. */
const loadUnit = async (db, auth, unitId, today) => {
  const unit = await repo.findUnit(db, unitId)
  if (!unit) throw new AppError('NOT_FOUND', { details: { unit_id: unitId } })
  if (!(await repo.hasAssignment(db, auth.driver_id, unitId, today))) {
    throw new AppError('FORBIDDEN', { details: { unit_id: unitId } })
  }
  return unit
}

const getTemplate = async (db) => {
  const [items, settings] = await Promise.all([repo.getCheckItems(db), resolveSettings(db)])
  return {
    items: items.map(({ code, label, hint }) => ({ code, label, hint })),
    body_photo_sides: settings.photo_rules.p2h_body.required_sides,
  }
}

const describe = async (db, unit, inspection) => {
  const [items, photos] = await Promise.all([repo.getItems(db, inspection.id), repo.getPhotos(db, inspection.id)])
  return {
    id: inspection.id,
    unit: unitRef(unit),
    date: inspection.inspection_date_text,
    status: inspection.status,
    can_operate: inspection.can_operate,
    checked_by: { id: inspection.checked_by, name: inspection.checked_by_name },
    checked_at: toWib(inspection.checked_at),
    location: { name: null, gps: gpsOf(inspection) },
    items: items.map((i) => ({
      code: i.code,
      label: i.label,
      result: i.result,
      ...(i.description ? { description: i.description } : {}),
    })),
    body_photos: photos.map((p) => serializeMedia({ ...p, side: p.photo_side })),
    admin_confirmed_by_driver: inspection.admin_confirmed_by_driver,
    valid_until: toWib(inspection.valid_until),
    ...auditFields(inspection),
  }
}

const getToday = async (db, auth, unitId) => {
  const today = wibDate()
  const unit = await loadUnit(db, auth, unitId, today)

  const current = await repo.findCurrent(db, unit.id, today)
  if (current) return describe(db, unit, current)

  const base = {
    unit: unitRef(unit), date: today, status: 'belum', p2h: null,
  }
  const previous = await repo.findSuperseded(db, unit.id, today)
  if (!previous) return base

  return {
    ...base,
    recheck_requested: true,
    previous: {
      id: previous.id,
      status: previous.status,
      checked_by: previous.checked_by_name,
      checked_at: toWib(previous.checked_at),
    },
  }
}

/** Cocokkan jawaban driver dengan checklist aktif: semua item wajib, tidak boleh ada kode asing / ganda. */
const checkAnswers = (answers, checklist) => {
  const details = []
  const known = new Map(checklist.map((c) => [c.code, c]))
  const seen = new Set()

  answers.forEach((a, index) => {
    if (!known.has(a.code)) details.push({ field: `items.${index}.code`, message: `Item "${a.code}" tidak ada di checklist.` })
    else if (seen.has(a.code)) details.push({ field: `items.${index}.code`, message: `Item "${a.code}" terkirim lebih dari sekali.` })
    seen.add(a.code)
  })
  checklist.filter((c) => !seen.has(c.code)).forEach((c) => {
    details.push({ field: 'items', message: `Item "${c.code}" (${c.label}) belum diisi.` })
  })

  if (details.length) throw new AppError('VALIDATION_ERROR', { details })
  return known
}

const checkPhotos = async (db, auth, photoIds, requiredSides) => {
  const missing = requiredSides.filter((s) => !photoIds[s])
  if (missing.length) throw invalid('body_photo_ids', `Foto ${missing.join(', ')} wajib diisi.`)

  const rows = await repo.findBodyMedia(db, auth.sub, Object.values(photoIds))
  const byId = new Map(rows.map((r) => [r.id, r]))
  const details = []
  Object.keys(photoIds).forEach((side) => {
    const media = byId.get(photoIds[side])
    if (!media) details.push({ field: `body_photo_ids.${side}`, message: 'Foto tidak ditemukan atau bukan foto badan milik Anda.' })
    else if (media.side !== side) details.push({ field: `body_photo_ids.${side}`, message: `Foto ini diambil untuk sisi ${media.side}.` })
  })
  if (details.length) throw new AppError('VALIDATION_ERROR', { details })
}

const submit = async (db, auth, unitId, body) => {
  const unit = await loadUnit(db, auth, unitId, wibDate())
  const settings = await resolveSettings(db)

  // Kirim ulang dari HP (offline sync) tidak membuat P2H ganda
  const duplicate = await repo.findByClientRef(db, auth.driver_id, body.client_ref)
  if (duplicate) return { inspection: duplicate, created: false }

  const inspectionDate = wibDate(body.checked_at)
  const current = await repo.findCurrent(db, unit.id, inspectionDate)
  if (current) {
    throw new AppError('CONFLICT', { details: { reason: 'p2h_already_submitted', p2h_id: current.id, status: current.status } })
  }

  const checklist = await repo.getCheckItems(db)
  const known = checkAnswers(body.items, checklist)
  await checkPhotos(db, auth, body.body_photo_ids, settings.photo_rules.p2h_body.required_sides)

  const failed = body.items.filter((i) => i.result === 'tidak_sesuai')
  if (failed.length && !body.admin_confirmed_by_driver) {
    throw invalid('admin_confirmed_by_driver', 'Konfirmasi sudah lapor admin wajib jika ada item tidak sesuai.')
  }

  // Status dihitung server, bukan dipercaya dari HP
  let status = 'layak'
  if (failed.length) status = failed.some((i) => known.get(i.code).is_critical) ? 'tidak_layak' : 'catatan'

  const inspection = await db.transaction((trx) => repo.insertInspection(
    trx,
    {
      unit_id: unit.id,
      inspection_date: inspectionDate,
      status,
      can_operate: status !== 'tidak_layak',
      checked_by: auth.driver_id,
      checked_at: body.checked_at,
      lat: body.gps.lat,
      lng: body.gps.lng,
      gps_accuracy_m: body.gps.accuracy_m === undefined ? null : body.gps.accuracy_m,
      admin_confirmed_by_driver: body.admin_confirmed_by_driver === undefined ? null : body.admin_confirmed_by_driver,
      valid_until: endOfWibDay(inspectionDate, settings.p2h.valid_until_local),
      client_ref: body.client_ref,
      created_by: auth.sub,
      updated_by: auth.sub,
    },
    body.items.map((i) => ({
      item_code: i.code,
      label: known.get(i.code).label,
      result: i.result,
      description: i.result === 'tidak_sesuai' ? i.description : null,
    })),
    Object.entries(body.body_photo_ids).map(([side, mediaId]) => ({ side, media_id: mediaId }))
  ))
  return { inspection, created: true }
}

const summarize = (inspection) => ({
  id: inspection.id,
  status: inspection.status,
  can_operate: inspection.can_operate,
  valid_until: toWib(inspection.valid_until),
})

/**
 * Admin meminta P2H ulang untuk sebuah unit (mis. setelah perbaikan). P2H aktif hari ini ditandai digantikan:
 * di aplikasi driver status unit kembali "belum" (dengan recheck_requested) dan DO yang belum diterima
 * tidak bisa diterima sampai driver membuat P2H baru. Hanya P2H hari ini yang bisa diminta ulang.
 */
const recheck = async (db, admin, unitId, { note }) => {
  const unit = await repo.findUnit(db, unitId)
  if (!unit) throw new AppError('NOT_FOUND', { details: { unit_id: unitId } })

  const today = wibDate()
  const current = await repo.findCurrent(db, unitId, today)
  if (!current) {
    throw new AppError('INVALID_STATE', {
      message: `Unit ${unit.plate} belum punya P2H aktif hari ini, atau P2H ulang sudah diminta dan menunggu driver.`,
      details: { unit_id: unitId, date: today },
    })
  }

  const changed = await repo.markRecheck(db, current.id, admin.id, note)
  if (!changed) throw new AppError('INVALID_STATE', { message: 'P2H baru saja diganti, muat ulang lalu coba lagi.', details: { unit_id: unitId } })

  return {
    unit: unitRef(unit),
    date: today,
    status: 'belum',
    recheck_requested: true,
    note,
    previous: {
      id: current.id,
      status: current.status,
      checked_by: current.checked_by_name,
      checked_at: toWib(current.checked_at),
    },
  }
}

module.exports = {
  getTemplate, getToday, getStatus, submit, summarize, recheck,
}
