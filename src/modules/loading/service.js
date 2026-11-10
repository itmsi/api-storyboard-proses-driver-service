const { AppError } = require('../../utils/errors')
const { resolveSettings } = require('../app/settings')
const media = require('../media/service')
const doService = require('../delivery-orders/service')
const doRepo = require('../delivery-orders/repository')
const repo = require('./repository')

const invalid = (field, message) => new AppError('VALIDATION_ERROR', { details: [{ field, message }] })

const result = (loading, rule) => ({
  id: loading.id,
  delivery_order_id: loading.delivery_order_id,
  photo_count: loading.photo_count,
  photo_rule: { min: rule.min, max: rule.max, satisfied: loading.photo_count >= rule.min && loading.photo_count <= rule.max },
  next_step: 'odometer_start',
})

/**
 * Foto muatan + surat jalan. DO harus berstatus accepted; setelahnya status menjadi loading.
 * Jumlah foto mengikuti photo_rules di /config.
 */
const create = async (db, auth, id, body) => {
  const settings = await resolveSettings(db)
  const rule = settings.photo_rules.loading

  // Kirim ulang dari HP: hasil sama
  const sent = await repo.findByClientRef(db, auth.sub, body.client_ref)
  if (sent) {
    if (sent.delivery_order_id !== id) throw new AppError('CONFLICT', { details: { reason: 'client_ref dipakai untuk DO lain' } })
    return { result: result(sent, rule), created: false }
  }

  const row = await doService.requireOwned(db, auth, id)
  doService.assertStatus(row, ['accepted'])

  const cargoIds = body.cargo_photo_ids
  const notes = body.delivery_note_pages
  const noteRule = settings.photo_rules.delivery_note_pages
  if (cargoIds.length < rule.min || cargoIds.length > rule.max) {
    throw invalid('cargo_photo_ids', `Foto muatan harus ${rule.min}-${rule.max} lembar.`)
  }
  if (notes.length < noteRule.min || notes.length > noteRule.max) {
    throw invalid('delivery_note_pages', `Surat jalan harus ${noteRule.min}-${noteRule.max} halaman.`)
  }
  if (new Set(notes.map((n) => n.page)).size !== notes.length) throw invalid('delivery_note_pages', 'Nomor halaman surat jalan tidak boleh sama.')

  await media.claim(db, auth, cargoIds, ['loading'], 'cargo_photo_ids')
  await media.claim(db, auth, notes.map((n) => n.media_id), ['delivery_note'], 'delivery_note_pages')

  const loading = await db.transaction(async (trx) => {
    await doRepo.findOwnedForUpdate(trx, auth.driver_id, id)
    const moved = await doRepo.updateIfStatus(trx, id, ['accepted'], { status: 'loading', updated_by: auth.sub })
    if (!moved) throw new AppError('INVALID_STATE', { details: { reason: 'status DO sudah berubah' } })

    const created = await repo.insert(trx, {
      delivery_order_id: id,
      loaded_at: body.loaded_at,
      lat: body.gps ? body.gps.lat : null,
      lng: body.gps ? body.gps.lng : null,
      gps_accuracy_m: body.gps && body.gps.accuracy_m !== undefined ? body.gps.accuracy_m : null,
      quantity_matches_do: body.quantity_matches_do,
      quantity_note: body.quantity_matches_do ? null : body.quantity_note,
      photo_count: cargoIds.length,
      client_ref: body.client_ref,
      created_by: auth.sub,
      updated_by: auth.sub,
    }, [
      ...cargoIds.map((mediaId, index) => ({
        delivery_order_id: id, media_id: mediaId, purpose: 'loading', sort_order: index,
      })),
      ...notes.map((n, index) => ({
        delivery_order_id: id, media_id: n.media_id, purpose: 'delivery_note', page_no: n.page, sort_order: index,
      })),
    ])
    await doRepo.insertEvent(trx, {
      delivery_order_id: id,
      event: 'loaded',
      from_status: 'accepted',
      to_status: 'loading',
      actor_id: auth.sub,
      occurred_at: body.loaded_at,
      lat: body.gps ? body.gps.lat : null,
      lng: body.gps ? body.gps.lng : null,
      payload: { quantity_matches_do: body.quantity_matches_do, photo_count: cargoIds.length, note_pages: notes.length },
      client_ref: body.client_ref,
    })
    return created
  })

  return { result: result(loading, rule), created: true }
}

module.exports = { create }
