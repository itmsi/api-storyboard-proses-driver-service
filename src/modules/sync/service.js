const { AppError } = require('../../utils/errors')
const { validateValue } = require('../../middlewares/validate')
const { describeError } = require('../../middlewares/error-handler')
const { toWib } = require('../../utils/date')
const { match, REQUIRED } = require('./routes')
const permissions = require('../../utils/permissions')
const { fetchDriverPermissions } = require('../../middlewares/permit')
const repo = require('./repository')

const failure = (status, error) => ({ status, error })

/**
 * Proses satu item seperti request biasa ke `path`: validasi yang sama, service yang sama.
 * Tidak pernah melempar; hasilnya selalu salah satu dari created | duplicate_ignored | failed.
 */
const processItem = async (db, auth, item, locale, granted) => {
  const context = `sync ${item.method} ${item.path}`
  const fail = (err) => ({
    outcome: failure('failed', describeError(err, locale, context)),
    meta: {},
  })

  const matched = match(item.method, item.path)
  if (!matched) {
    return fail(new AppError('ROUTE_NOT_FOUND', { details: { method: item.method, path: item.path, reason: 'endpoint ini tidak bisa dikirim lewat sync' } }))
  }
  const { route, params } = matched
  const meta = { type: route.type }

  // Hak driver untuk jenis item ini (sama dengan hak endpoint aslinya)
  const [resource, action] = REQUIRED[route.type]
  if (!permissions.can(granted, resource, action)) {
    return {
      ...fail(new AppError('FORBIDDEN', { message: 'Akun Anda tidak punya hak untuk tindakan ini.', details: { required: `${resource}:${action}` } })),
      meta,
    }
  }

  if (route.paramSchema) {
    const checked = validateValue(route.paramSchema, params)
    if (checked.details.length) return { ...fail(new AppError('VALIDATION_ERROR', { details: checked.details })), meta }
  }
  const doId = route.doScoped ? params.id : null

  const { client_ref: bodyRef, ...rest } = item.body
  if (bodyRef !== undefined && bodyRef !== item.client_ref) {
    return { ...fail(new AppError('VALIDATION_ERROR', { details: [{ field: 'body.client_ref', message: 'Harus sama dengan client_ref item.' }] })), meta: { ...meta, doId } }
  }
  const checked = validateValue(route.bodySchema, { ...rest, client_ref: item.client_ref })
  const label = route.label(item.body)
  if (checked.details.length) {
    return { ...fail(new AppError('VALIDATION_ERROR', { details: checked.details })), meta: { ...meta, doId, label } }
  }

  try {
    const { id, created } = await route.run(db, auth, params, checked.value)
    return { outcome: { status: created ? 'created' : 'duplicate_ignored', id }, meta: { ...meta, doId, label } }
  } catch (err) {
    return { ...fail(err), meta: { ...meta, doId, label } }
  }
}

/**
 * Antrean offline: item diproses berurutan menurut client_created_at (urutan asli di HP), bukan urutan kirim,
 * supaya langkah yang saling bergantung (muat -> odometer -> biaya -> serah terima) tetap benar.
 * Hasil dikembalikan menurut urutan request. Satu item gagal tidak menghentikan item lain.
 */
const processBatch = async (db, auth, { device_id: deviceId, items }, locale) => {
  const order = items.map((item, index) => ({ item, index }))
    .sort((a, b) => new Date(a.item.client_created_at) - new Date(b.item.client_created_at) || a.index - b.index)

  // Hak dibaca sekali per batch (perubahan role berlaku di batch berikutnya)
  const granted = await fetchDriverPermissions(db, auth.sub)

  const results = new Array(items.length)
  for (const { item, index } of order) { // eslint-disable-line no-restricted-syntax
    // eslint-disable-next-line no-await-in-loop
    const { outcome, meta } = await processItem(db, auth, item, locale, granted)
    results[index] = { client_ref: item.client_ref, ...outcome }

    // eslint-disable-next-line no-await-in-loop
    await repo.record(db, auth.sub, {
      device_id: deviceId,
      client_ref: item.client_ref,
      method: item.method,
      path: item.path.slice(0, 300),
      delivery_order_id: meta.doId || null,
      type: meta.type || 'unknown',
      label: meta.label || null,
      status: outcome.status === 'failed' ? 'failed' : 'created',
      error: outcome.status === 'failed' ? outcome.error : null,
      result_id: outcome.id ? String(outcome.id) : null,
      client_created_at: item.client_created_at,
    }).catch(() => {}) // pencatatan gagal tidak boleh menggagalkan hasil item yang sudah diproses
  }
  await repo.touchDevice(db, auth.sub, deviceId)

  const count = (status) => results.filter((r) => r.status === status).length
  return {
    results,
    meta: {
      processed_at: toWib(new Date()),
      created: count('created'),
      duplicate_ignored: count('duplicate_ignored'),
      failed: count('failed'),
    },
  }
}

module.exports = { processBatch }
