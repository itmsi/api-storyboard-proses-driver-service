const crypto = require('crypto')
const { AppError } = require('../../utils/errors')
const { toWib, wibDate } = require('../../utils/date')
const { resolveSettings } = require('../app/settings')
const media = require('../media/service')
const { serializeMedia } = require('../media/serializer')
const doService = require('../delivery-orders/service')
const doRepo = require('../delivery-orders/repository')
const repo = require('./repository')

const RECEIPT_FIELDS = ['time', 'fuel_type', 'liters', 'price_per_liter', 'total']
// Selisih liter x harga dengan total yang masih dianggap wajar (pembulatan SPBU)
const TOTAL_TOLERANCE = 0.01
// Struk boleh sedikit "lebih baru" dari jam HP karena jam tidak sinkron
const CLOCK_SKEW_MS = 5 * 60 * 1000

const invalid = (field, message) => new AppError('VALIDATION_ERROR', { details: [{ field, message }] })
const isSet = (value) => value !== null && value !== undefined

/** Hanya field struk yang terisi. */
const pickReceipt = (fields) => Object.fromEntries(RECEIPT_FIELDS.filter((k) => fields && isSet(fields[k])).map((k) => [k, fields[k]]))

const hhmm = (value) => (value ? String(value).slice(0, 5) : null)

/** Pemeriksaan informatif untuk admin (tidak memblokir): total masuk akal, jam struk di antara mulai DO dan saat dicatat. */
const buildChecks = (effective, capturedAt, startedAt) => {
  const { liters, price_per_liter: price, total } = effective
  const matches = isSet(liters) && isSet(price) && isSet(total)
    ? Math.abs(liters * price - total) <= Math.max(1, total * TOTAL_TOLERANCE)
    : null

  let withinDo = null
  if (effective.time && startedAt) {
    const receiptAt = new Date(`${wibDate(capturedAt)}T${effective.time}:00+07:00`)
    withinDo = receiptAt >= new Date(startedAt) && receiptAt.getTime() <= new Date(capturedAt).getTime() + CLOCK_SKEW_MS
  }
  return { liters_x_price_matches_total: matches, receipt_time_within_do: withinDo, receipt_not_used_before: true }
}

const fingerprintOf = (capturedAt, e) => (e.time && isSet(e.total)
  ? crypto.createHash('sha256').update([wibDate(capturedAt), e.time, e.total, e.liters ?? '', e.fuel_type ?? ''].join('|')).digest('hex')
  : null)

const gpsOf = (row) => (row.lat === null ? null : {
  lat: Number(row.lat),
  lng: Number(row.lng),
  ...(row.gps_accuracy_m === null ? {} : { accuracy_m: Number(row.gps_accuracy_m) }),
})

const label = (row) => {
  if (row.category_input === 'receipt_ocr') {
    const liters = isSet(row.liters) ? ` ${Number(row.liters)} L` : ''
    return `${row.fuel_type || row.category_label}${liters}`.trim()
  }
  return row.description || row.category_label
}

const serialize = (row, mediaRow) => {
  if (row.category_input !== 'receipt_ocr') {
    return {
      id: row.id,
      category: row.category_code,
      amount: Number(row.amount),
      description: row.description,
      has_proof: Boolean(row.proof_media_id),
      recorded_at: toWib(row.recorded_at),
      gps: gpsOf(row),
    }
  }
  const effective = {
    time: hhmm(row.receipt_time),
    fuel_type: row.fuel_type,
    liters: isSet(row.liters) ? Number(row.liters) : null,
    price_per_liter: isSet(row.price_per_liter) ? Number(row.price_per_liter) : null,
    total: Number(row.amount),
  }
  return {
    id: row.id,
    category: row.category_code,
    amount: Number(row.amount),
    ocr: row.ocr_fields,
    corrected: row.corrected_fields,
    effective,
    corrected_fields: row.corrected_fields ? Object.keys(row.corrected_fields) : [],
    correction_reason: row.correction_reason,
    checks: row.checks,
    media: mediaRow ? serializeMedia(mediaRow) : null,
    recorded_at: toWib(row.recorded_at),
    gps: gpsOf(row),
  }
}

const duplicateError = (found) => new AppError('DUPLICATE_RECEIPT', {
  details: { existing_expense_id: found.expense_id, delivery_order_no: found.delivery_order_no },
})

/** Biaya BBM dari struk: nilai efektif = koreksi driver jika ada, selain itu OCR. */
const buildReceipt = async (db, auth, body, settings, doRow) => {
  if (!body.media_id) throw invalid('media_id', 'Foto struk wajib diisi.')
  if (!body.captured_at) throw invalid('captured_at', 'Waktu struk wajib diisi.')

  const ocr = pickReceipt(body.ocr)
  const corrected = pickReceipt(body.corrected)
  const hasCorrection = Object.keys(corrected).length > 0
  if (hasCorrection && settings.correction_reason_required && !body.correction_reason) {
    throw invalid('correction_reason', 'Alasan koreksi wajib diisi jika ada nilai yang dikoreksi.')
  }

  const effective = { ...ocr, ...corrected }
  if (!isSet(effective.total)) throw invalid('corrected.total', 'Total struk wajib diisi (isi di ocr.total atau corrected.total).')

  const [photo] = await media.claim(db, auth, [body.media_id], ['receipt'], 'media_id')
  const fingerprint = fingerprintOf(body.captured_at, effective)
  const duplicate = await repo.findDuplicateReceipt(db, { fingerprint, sha256: photo.sha256 })
  if (duplicate) throw duplicateError(duplicate)

  return {
    photo,
    row: {
      amount: effective.total,
      proof_media_id: photo.id,
      fuel_type: effective.fuel_type ?? null,
      liters: effective.liters ?? null,
      price_per_liter: effective.price_per_liter ?? null,
      receipt_time: effective.time ?? null,
      ocr_fields: Object.keys(ocr).length ? ocr : null,
      corrected_fields: hasCorrection ? corrected : null,
      correction_reason: hasCorrection ? body.correction_reason : null,
      checks: buildChecks(effective, body.captured_at, doRow.started_at),
      receipt_fingerprint: fingerprint,
      recorded_at: body.captured_at,
    },
  }
}

/** Biaya manual (tol, parkir, lainnya): jumlah + keterangan, bukti foto opsional kecuali kategori mewajibkan. */
const buildManual = async (db, auth, body, category) => {
  if (!body.amount) throw invalid('amount', 'Jumlah biaya wajib diisi.')
  if (!body.recorded_at) throw invalid('recorded_at', 'Waktu pencatatan wajib diisi.')
  if (category.description_required && !body.description) throw invalid('description', 'Keterangan wajib diisi untuk kategori ini.')
  if (category.proof_required && !body.proof_media_id) throw invalid('proof_media_id', 'Foto bukti wajib untuk kategori ini.')

  let photo = null
  if (body.proof_media_id) [photo] = await media.claim(db, auth, [body.proof_media_id], ['receipt'], 'proof_media_id')
  return {
    photo,
    row: {
      amount: body.amount,
      description: body.description || null,
      proof_media_id: photo ? photo.id : null,
      recorded_at: body.recorded_at,
    },
  }
}

const create = async (db, auth, id, body) => {
  const sent = await repo.findByClientRef(db, auth.sub, body.client_ref)
  if (sent) {
    if (sent.delivery_order_id !== id) throw new AppError('CONFLICT', { details: { reason: 'client_ref dipakai untuk DO lain' } })
    return { result: serialize(sent, sent.proof_media_id ? await repo.findMedia(db, sent.proof_media_id) : null), created: false }
  }

  const doRow = await doService.requireOwned(db, auth, id)
  doService.assertStatus(doRow, ['in_transit', 'handover'])

  const category = await repo.findCategory(db, body.category)
  if (!category) throw invalid('category', `Kategori "${body.category}" tidak dikenal.`)

  const settings = await resolveSettings(db)
  const built = category.input === 'receipt_ocr'
    ? await buildReceipt(db, auth, body, settings, doRow)
    : await buildManual(db, auth, body, category)

  let saved
  try {
    saved = await db.transaction(async (trx) => {
      await doRepo.findOwnedForUpdate(trx, auth.driver_id, id)
      const created = await repo.insert(trx, {
        ...built.row,
        delivery_order_id: id,
        category_code: category.code,
        lat: body.gps ? body.gps.lat : null,
        lng: body.gps ? body.gps.lng : null,
        gps_accuracy_m: body.gps && body.gps.accuracy_m !== undefined ? body.gps.accuracy_m : null,
        client_ref: body.client_ref,
        created_by: auth.sub,
        updated_by: auth.sub,
      })
      await repo.refreshDoTotal(trx, id, auth.sub)
      await doRepo.insertEvent(trx, {
        delivery_order_id: id,
        event: 'expense_added',
        from_status: doRow.status,
        to_status: doRow.status,
        actor_id: auth.sub,
        occurred_at: built.row.recorded_at,
        lat: body.gps ? body.gps.lat : null,
        lng: body.gps ? body.gps.lng : null,
        payload: { category: category.code, amount: Number(built.row.amount) },
        client_ref: body.client_ref,
      })
      return created
    })
  } catch (err) {
    // Dua struk yang sama dikirim bersamaan: unique index fingerprint/foto menang
    if (err.code === '23505' && /expenses_receipt_uq|expenses_proof_media_id_unique/.test(err.constraint || '')) {
      const found = await repo.findDuplicateReceipt(db, {
        fingerprint: built.row.receipt_fingerprint, sha256: built.photo && built.photo.sha256,
      })
      if (found) throw duplicateError(found)
    }
    throw err
  }

  return { result: serialize({ ...saved, category_input: category.input, category_label: category.label }, built.photo), created: true }
}

const list = async (db, auth, id) => {
  const doRow = await doService.requireOwned(db, auth, id)
  const rows = await repo.listForDo(db, id)
  const total = rows.reduce((sum, r) => sum + Number(r.amount), 0)
  const allowance = Number(doRow.travel_allowance_amount)
  return {
    data: rows.map((r) => ({
      id: r.id,
      category: r.category_code,
      label: label(r),
      amount: Number(r.amount),
      has_proof: Boolean(r.proof_media_id),
      corrected: Boolean(r.corrected_fields),
      recorded_at: toWib(r.recorded_at),
      sync: 'sent', // semua yang sudah sampai server; antrean offline hanya ada di HP
    })),
    meta: { total, travel_allowance: allowance, remaining: allowance - total },
  }
}

module.exports = { create, list }
