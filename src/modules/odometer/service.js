const { AppError } = require('../../utils/errors')
const { toWib } = require('../../utils/date')
const { resolveSettings } = require('../app/settings')
const media = require('../media/service')
const { serializeMedia } = require('../media/serializer')
const doService = require('../delivery-orders/service')
const doRepo = require('../delivery-orders/repository')
const repo = require('./repository')

const invalid = (field, message) => new AppError('VALIDATION_ERROR', { details: [{ field, message }] })

const isSet = (value) => value !== null && value !== undefined

const hasValue = (reading) => Boolean(reading) && (isSet(reading.km) || isSet(reading.fuel_level))

const pick = (reading) => ({
  ...(reading && reading.km !== null && reading.km !== undefined ? { km: reading.km } : {}),
  ...(reading && reading.fuel_level ? { fuel_level: reading.fuel_level } : {}),
})

const result = (row, mediaRow) => ({
  id: row.id,
  type: row.type,
  media: serializeMedia(mediaRow),
  ocr: row.ocr_km === null && row.ocr_fuel_level === null ? null : { km: row.ocr_km, fuel_level: row.ocr_fuel_level },
  corrected: row.corrected_km === null && row.corrected_fuel_level === null ? null : {
    ...(row.corrected_km === null ? {} : { km: row.corrected_km }),
    ...(row.corrected_fuel_level === null ? {} : { fuel_level: row.corrected_fuel_level }),
  },
  correction_reason: row.correction_reason,
  effective: { km: row.effective_km, fuel_level: row.effective_fuel_level, source: row.effective_source },
  captured_at: toWib(row.captured_at),
  next_step: row.type === 'start' ? 'in_transit' : 'complete',
})

/**
 * Odometer awal (setelah muat) / akhir (setelah serah terima).
 * Nilai efektif = koreksi driver jika ada, selain itu hasil OCR. Koreksi wajib beralasan.
 */
const create = async (db, auth, id, body) => {
  const sent = await repo.findByClientRef(db, auth.sub, body.client_ref)
  if (sent) {
    if (sent.delivery_order_id !== id) throw new AppError('CONFLICT', { details: { reason: 'client_ref dipakai untuk DO lain' } })
    return { result: result(sent, await repo.findMedia(db, sent.media_id)), created: false }
  }

  const { type } = body
  const row = await doService.requireOwned(db, auth, id)
  doService.assertStatus(row, [type === 'start' ? 'loading' : 'handover'])
  if (type === 'end' && row.odometer_end_km !== null) {
    throw new AppError('INVALID_STATE', { details: { reason: 'odometer akhir sudah dicatat' } })
  }

  const settings = await resolveSettings(db)
  const correctedValues = pick(body.corrected)
  const corrected = hasValue(correctedValues) ? correctedValues : null
  if (corrected && settings.correction_reason_required && !body.correction_reason) {
    throw invalid('correction_reason', 'Alasan koreksi wajib diisi jika ada nilai yang dikoreksi.')
  }

  const ocr = pick(body.ocr)
  const km = corrected && corrected.km !== undefined ? corrected.km : ocr.km
  const fuel = corrected && corrected.fuel_level ? corrected.fuel_level : (ocr.fuel_level || null)
  if (km === undefined) throw invalid('corrected.km', 'Angka odometer wajib diisi (isi di ocr.km atau corrected.km).')
  if (type === 'end' && km < row.odometer_start_km) {
    throw invalid('corrected.km', `Odometer akhir (${km}) tidak boleh lebih kecil dari odometer awal (${row.odometer_start_km}).`)
  }

  const [photo] = await media.claim(db, auth, [body.media_id], [type === 'start' ? 'odometer_start' : 'odometer_end'], 'media_id')

  const saved = await db.transaction(async (trx) => {
    await doRepo.findOwnedForUpdate(trx, auth.driver_id, id)
    const moved = await doRepo.updateIfStatus(trx, id, [type === 'start' ? 'loading' : 'handover'], type === 'start'
      ? {
        status: 'in_transit', started_at: body.captured_at, odometer_start_km: km, updated_by: auth.sub,
      }
      : { odometer_end_km: km, updated_by: auth.sub })
    if (!moved) throw new AppError('INVALID_STATE', { details: { reason: 'status DO sudah berubah' } })

    const created = await repo.insert(trx, {
      delivery_order_id: id,
      type,
      media_id: photo.id,
      ocr_km: ocr.km === undefined ? null : ocr.km,
      ocr_fuel_level: ocr.fuel_level || null,
      corrected_km: corrected && corrected.km !== undefined ? corrected.km : null,
      corrected_fuel_level: corrected && corrected.fuel_level ? corrected.fuel_level : null,
      correction_reason: corrected ? body.correction_reason : null,
      effective_km: km,
      effective_fuel_level: fuel,
      effective_source: corrected ? 'corrected' : 'ocr',
      captured_at: body.captured_at,
      lat: body.gps ? body.gps.lat : null,
      lng: body.gps ? body.gps.lng : null,
      gps_accuracy_m: body.gps && body.gps.accuracy_m !== undefined ? body.gps.accuracy_m : null,
      client_ref: body.client_ref,
      created_by: auth.sub,
      updated_by: auth.sub,
    })
    if (type === 'end') await repo.raiseUnitOdometer(trx, row.unit_id, km)
    await doRepo.insertEvent(trx, {
      delivery_order_id: id,
      event: type === 'start' ? 'odometer_start' : 'odometer_end',
      from_status: row.status,
      to_status: type === 'start' ? 'in_transit' : row.status,
      actor_id: auth.sub,
      occurred_at: body.captured_at,
      lat: body.gps ? body.gps.lat : null,
      lng: body.gps ? body.gps.lng : null,
      payload: { km, source: corrected ? 'corrected' : 'ocr' },
      client_ref: body.client_ref,
    })
    return created
  })

  return { result: result(saved, photo), created: true }
}

module.exports = { create }
