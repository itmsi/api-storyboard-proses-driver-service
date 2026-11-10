const { AppError } = require('../../utils/errors')
const { resolveSettings } = require('../app/settings')
const media = require('../media/service')
const doService = require('../delivery-orders/service')
const doRepo = require('../delivery-orders/repository')
const repo = require('./repository')

const DELIVERY_STATUS = { lengkap: 'terkirim_lengkap', masalah: 'terkirim_catatan', gagal_kirim: 'gagal_kirim' }

const invalid = (field, message) => new AppError('VALIDATION_ERROR', { details: [{ field, message }] })

const result = (handover) => ({
  id: handover.id,
  condition: handover.condition,
  delivery_status: DELIVERY_STATUS[handover.condition],
  next_step: 'odometer_end',
})

const checkCount = (list, rule, field, what) => {
  if (list.length < rule.min || list.length > rule.max) throw invalid(field, `${what} harus ${rule.min}-${rule.max} lembar.`)
}

/**
 * Serah terima barang di tujuan (DO in_transit -> handover). Hasil pengiriman ditentukan server dari `condition`:
 * lengkap -> terkirim_lengkap, masalah -> terkirim_catatan, gagal_kirim -> gagal_kirim.
 * Setelah ini driver mencatat odometer akhir lalu menyelesaikan DO.
 */
const create = async (db, auth, id, body) => {
  const sent = await repo.findByClientRef(db, auth.sub, body.client_ref)
  if (sent) {
    if (sent.delivery_order_id !== id) throw new AppError('CONFLICT', { details: { reason: 'client_ref dipakai untuk DO lain' } })
    return { result: result(sent), created: false }
  }

  const row = await doService.requireOwned(db, auth, id)
  doService.assertStatus(row, ['in_transit'])

  const settings = await resolveSettings(db)
  const { condition } = body
  const links = [] // foto yang menempel ke DO: [{ media_id, purpose, page_no? }]
  let issues = []

  if (condition === 'gagal_kirim') {
    checkCount(body.location_photo_ids, settings.photo_rules.unloading, 'location_photo_ids', 'Foto lokasi')
    if (body.failure_reason === 'lainnya' && !body.note) throw invalid('note', 'Catatan wajib diisi untuk alasan "lainnya".')
    await media.claim(db, auth, body.location_photo_ids, ['location'], 'location_photo_ids')
    body.location_photo_ids.forEach((m) => links.push({ media_id: m, purpose: 'location' }))
  } else {
    checkCount(body.unloading_photo_ids, settings.photo_rules.unloading, 'unloading_photo_ids', 'Foto bongkar')
    checkCount(body.stamped_delivery_note_ids, settings.photo_rules.delivery_note_pages, 'stamped_delivery_note_ids', 'Surat jalan bercap')
    await media.claim(db, auth, body.unloading_photo_ids, ['unloading'], 'unloading_photo_ids')
    await media.claim(db, auth, body.stamped_delivery_note_ids, ['stamped_delivery_note'], 'stamped_delivery_note_ids')
    await media.claim(db, auth, [body.receiver.signature_media_id], ['signature'], 'receiver.signature_media_id')
    body.unloading_photo_ids.forEach((m, i) => links.push({ media_id: m, purpose: 'unloading', sort_order: i }))
    body.stamped_delivery_note_ids.forEach((m, i) => links.push({
      media_id: m, purpose: 'stamped_delivery_note', page_no: i + 1, sort_order: i,
    }))
    links.push({ media_id: body.receiver.signature_media_id, purpose: 'signature' })

    if (condition === 'masalah') {
      if (body.received_quantity > Number(row.cargo_quantity)) {
        throw invalid('received_quantity', `Jumlah diterima tidak boleh melebihi jumlah DO (${Number(row.cargo_quantity)}).`)
      }
      if (body.receiver.acknowledges_issues === undefined) {
        throw invalid('receiver.acknowledges_issues', 'Penerima harus menyatakan mengakui/tidak mengakui masalah.')
      }
      issues = body.issues
      const photoIds = issues.flatMap((issue) => issue.photo_ids)
      if (photoIds.length) await media.claim(db, auth, photoIds, ['damage'], 'issues.photo_ids')
    }
  }

  const handover = await db.transaction(async (trx) => {
    await doRepo.findOwnedForUpdate(trx, auth.driver_id, id)
    const moved = await doRepo.updateIfStatus(trx, id, ['in_transit'], {
      status: 'handover', delivery_status: DELIVERY_STATUS[condition], updated_by: auth.sub,
    })
    if (!moved) throw new AppError('INVALID_STATE', { details: { reason: 'status DO sudah berubah' } })

    const recordedAt = body.recorded_at || (body.receiver && body.receiver.signed_at) || new Date()
    const created = await repo.insertHandover(trx, {
      delivery_order_id: id,
      condition,
      received_quantity: condition === 'masalah' ? body.received_quantity : null,
      failure_reason: condition === 'gagal_kirim' ? body.failure_reason : null,
      note: body.note || null,
      receiver_name: body.receiver ? body.receiver.name : null,
      signature_media_id: body.receiver ? body.receiver.signature_media_id : null,
      signed_at: body.receiver ? body.receiver.signed_at : null,
      acknowledges_issues: condition === 'masalah' ? body.receiver.acknowledges_issues : null,
      recorded_at: recordedAt,
      lat: body.gps.lat,
      lng: body.gps.lng,
      gps_accuracy_m: body.gps.accuracy_m === undefined ? null : body.gps.accuracy_m,
      client_ref: body.client_ref,
      created_by: auth.sub,
      updated_by: auth.sub,
    })
    await repo.insertIssues(trx, created.id, issues)
    await repo.insertDoMedia(trx, links.map((l) => ({ sort_order: 0, ...l, delivery_order_id: id })))
    await doRepo.insertEvent(trx, {
      delivery_order_id: id,
      event: 'handover',
      from_status: 'in_transit',
      to_status: 'handover',
      actor_id: auth.sub,
      occurred_at: recordedAt,
      lat: body.gps.lat,
      lng: body.gps.lng,
      payload: { condition, delivery_status: DELIVERY_STATUS[condition], issue_count: issues.length },
      client_ref: body.client_ref,
    })
    return created
  })

  return { result: result(handover), created: true }
}

module.exports = { create }
