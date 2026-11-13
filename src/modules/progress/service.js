const { AppError } = require('../../utils/errors')
const { auditFields } = require('../../utils/audit')
const { toWib } = require('../../utils/date')
const doService = require('../delivery-orders/service')
const { serializeMedia } = require('../media/serializer')
const repo = require('./repository')

const num = (value) => (value === null || value === undefined ? null : Number(value))

const gpsOf = (row) => (row.lat === null || row.lat === undefined ? null : {
  lat: Number(row.lat),
  lng: Number(row.lng),
  ...(row.gps_accuracy_m === null || row.gps_accuracy_m === undefined ? {} : { accuracy_m: Number(row.gps_accuracy_m) }),
})

const notDone = (step, id) => new AppError('NOT_FOUND', {
  message: 'Langkah ini belum dilakukan pada DO tersebut.',
  details: { delivery_order_id: id, step, reason: 'langkah_belum_dilakukan' },
})

/** Langkah muat: waktu, jawaban jumlah muatan, foto muatan, dan halaman surat jalan. */
const getLoading = async (db, auth, id) => {
  await doService.requireOwned(db, auth, id)
  const row = await repo.loading(db, id)
  if (!row) throw notDone('loading', id)
  const media = await repo.doMedia(db, id)
  return {
    id: row.id,
    delivery_order_id: id,
    loaded_at: toWib(row.loaded_at),
    gps: gpsOf(row),
    quantity_matches_do: row.quantity_matches_do,
    quantity_note: row.quantity_note,
    photo_count: row.photo_count,
    cargo_photos: media.filter((m) => m.purpose === 'loading').map((m) => serializeMedia(m)),
    delivery_note_pages: media.filter((m) => m.purpose === 'delivery_note').map((m) => ({ page: m.page_no, media: serializeMedia(m) })),
    ...auditFields(row),
  }
}

const reading = (row, mediaById) => {
  if (!row) return null
  const photo = mediaById.get(row.media_id)
  return {
    id: row.id,
    type: row.type,
    km: row.effective_km,
    fuel_level: row.effective_fuel_level,
    source: row.effective_source, // ocr | corrected
    ocr: row.ocr_km === null && row.ocr_fuel_level === null ? null : { km: row.ocr_km, fuel_level: row.ocr_fuel_level },
    corrected: row.corrected_km === null && row.corrected_fuel_level === null ? null : { km: row.corrected_km, fuel_level: row.corrected_fuel_level },
    correction_reason: row.correction_reason,
    captured_at: toWib(row.captured_at),
    gps: gpsOf(row),
    media: photo ? serializeMedia(photo) : null,
  }
}

/** Odometer awal dan akhir. Yang belum dicatat bernilai null (DO baru diterima: keduanya null). */
const getOdometer = async (db, auth, id) => {
  await doService.requireOwned(db, auth, id)
  const rows = await repo.odometers(db, id)
  const photos = await repo.mediaByIds(db, rows.map((r) => r.media_id))
  const mediaById = new Map(photos.map((m) => [m.id, m]))
  const find = (type) => rows.find((r) => r.type === type)
  const start = reading(find('start'), mediaById)
  const end = reading(find('end'), mediaById)
  return {
    delivery_order_id: id,
    start,
    end,
    distance_km: start && end ? end.km - start.km : null,
  }
}

/** Serah terima: kondisi, penerima dan tanda tangan, foto bongkar, surat jalan bercap, dan masalah beserta fotonya. */
const getHandover = async (db, auth, id) => {
  const order = await doService.requireOwned(db, auth, id)
  const row = await repo.handover(db, id)
  if (!row) throw notDone('handover', id)

  const [media, issuePhotos] = await Promise.all([repo.doMedia(db, id), repo.issuePhotos(db, row.issues.map((i) => i.id))])
  const of = (purpose) => media.filter((m) => m.purpose === purpose)
  const signature = of('signature')[0]

  return {
    id: row.id,
    delivery_order_id: id,
    condition: row.condition, // lengkap | masalah | gagal_kirim
    delivery_status: order.delivery_status,
    recorded_at: toWib(row.recorded_at),
    gps: gpsOf(row),
    note: row.note,
    receiver: row.receiver_name ? {
      name: row.receiver_name,
      signed_at: toWib(row.signed_at),
      acknowledges_issues: row.acknowledges_issues,
      signature: signature ? serializeMedia(signature) : null,
    } : null,
    received_quantity: num(row.received_quantity),
    failure_reason: row.failure_reason,
    unloading_photos: of('unloading').map((m) => serializeMedia(m)),
    stamped_delivery_notes: of('stamped_delivery_note').map((m) => ({ page: m.page_no, media: serializeMedia(m) })),
    location_photos: of('location').map((m) => serializeMedia(m)),
    issues: row.issues.map((issue) => ({
      id: issue.id,
      type: issue.type,
      quantity: num(issue.quantity),
      unit: issue.unit,
      note: issue.note,
      photos: issuePhotos.filter((p) => p.issue_id === issue.id).map((p) => serializeMedia(p)),
    })),
    ...auditFields(row),
  }
}

module.exports = { getLoading, getOdometer, getHandover }
