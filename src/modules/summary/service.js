const { AppError } = require('../../utils/errors')
const { toWib } = require('../../utils/date')
const { settle } = require('../../utils/settlement')
const expenses = require('../expenses/service')
const doService = require('../delivery-orders/service')
const doRepo = require('../delivery-orders/repository')
const repo = require('./repository')

const MINUTE_MS = 60 * 1000

const reading = (row) => (row ? { km: row.effective_km, source: row.effective_source } : null)

const minutesBetween = (from, to) => (from && to ? Math.max(0, Math.round((new Date(to) - new Date(from)) / MINUTE_MS)) : null)

/** Ringkasan perjalanan. Tersedia setelah serah terima (handover) dan setelah DO selesai. */
const getSummary = async (db, auth, id) => {
  const row = await doService.requireOwned(db, auth, id)
  if (!['handover', 'completed'].includes(row.status)) {
    throw new AppError('INVALID_STATE', { details: { status: row.status, expected: ['handover', 'completed'] } })
  }

  const [odometers, list] = await Promise.all([repo.getOdometers(db, id), expenses.list(db, auth, id)])
  const start = odometers.find((o) => o.type === 'start')
  const end = odometers.find((o) => o.type === 'end')
  const { total } = list.meta
  const allowance = Number(row.travel_allowance_amount)

  return {
    delivery_order_id: row.id,
    no: row.no,
    delivery_status: row.delivery_status,
    odometer: {
      start: reading(start),
      end: reading(end),
      distance_km: start && end ? end.effective_km - start.effective_km : null,
    },
    duration_minutes: minutesBetween(row.started_at, row.completed_at || (end && end.captured_at)),
    expenses: list.data,
    expense_total: total,
    travel_allowance: allowance,
    settlement: settle(allowance, total),
  }
}

const completeResult = async (db, auth, id) => {
  const row = await doService.requireOwned(db, auth, id)
  return {
    id: row.id,
    status: row.status,
    locked: Boolean(row.locked_at),
    completed_at: toWib(row.completed_at),
    sync: 'sent',
    message: 'DO selesai dicatat dan terkirim ke admin.',
  }
}

/**
 * Selesaikan DO: hanya setelah serah terima dan odometer akhir. Mengunci DO dan membekukan rekap keuangan
 * (settlements), jadi biaya yang dicatat/diubah setelahnya tidak mengubah angka yang sudah dilaporkan.
 */
const complete = async (db, auth, id, body) => {
  const sent = await doRepo.findEventByClientRef(db, auth.sub, body.client_ref)
  if (sent) {
    if (sent.delivery_order_id !== id) throw new AppError('CONFLICT', { details: { reason: 'client_ref dipakai untuk DO lain' } })
    return { result: await completeResult(db, auth, id), created: false }
  }

  const row = await doService.requireOwned(db, auth, id)
  doService.assertStatus(row, ['handover'])
  if (row.odometer_end_km === null) {
    throw new AppError('INVALID_STATE', { details: { reason: 'odometer akhir belum dicatat', expected_step: 'odometer_end' } })
  }
  if (new Date(body.completed_at) < new Date(row.started_at)) {
    throw new AppError('VALIDATION_ERROR', { details: [{ field: 'completed_at', message: 'Waktu selesai tidak boleh sebelum DO dimulai.' }] })
  }

  await db.transaction(async (trx) => {
    await doRepo.findOwnedForUpdate(trx, auth.driver_id, id)
    const done = await doRepo.updateIfStatus(trx, id, ['handover'], {
      status: 'completed', completed_at: body.completed_at, locked_at: trx.fn.now(), updated_by: auth.sub,
    })
    if (!done) throw new AppError('INVALID_STATE', { details: { reason: 'status DO sudah berubah' } })

    const total = Number(done.expense_total)
    const allowance = Number(done.travel_allowance_amount)
    const settlement = settle(allowance, total)
    await repo.insertSettlement(trx, {
      delivery_order_id: id,
      travel_allowance: allowance,
      expense_total: total,
      type: settlement.type,
      amount: settlement.amount,
      distance_km: done.odometer_end_km - done.odometer_start_km,
      duration_minutes: minutesBetween(done.started_at, body.completed_at),
      created_by: auth.sub,
      updated_by: auth.sub,
    })
    await doRepo.insertEvent(trx, {
      delivery_order_id: id,
      event: 'completed',
      from_status: 'handover',
      to_status: 'completed',
      actor_id: auth.sub,
      occurred_at: body.completed_at,
      lat: body.gps ? body.gps.lat : null,
      lng: body.gps ? body.gps.lng : null,
      payload: { expense_total: total, settlement_type: settlement.type, settlement_amount: settlement.amount },
      client_ref: body.client_ref,
    })
  })

  return { result: await completeResult(db, auth, id), created: true }
}

module.exports = { getSummary, complete }
