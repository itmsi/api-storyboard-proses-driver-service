const { AppError } = require('../../utils/errors')
const { toWib } = require('../../utils/date')
const pagination = require('../../utils/pagination')
const master = require('../../utils/master')
const { LABELS } = require('../../utils/settlement')
const doRepo = require('../delivery-orders/repository')
const repo = require('./repository')

// Rekap uang jalan per DO yang sudah selesai (dibuat otomatis saat DO diselesaikan driver). Admin melihat
// selisihnya dan menandai bila sudah disetor ke perusahaan (refund_to_company) atau dibayar ke driver (payable_to_driver).

const SORTABLE = {
  completed_at: 'delivery_orders.completed_at', amount: 'settlements.amount', type: 'settlements.type', do: 'delivery_orders.no',
}

const num = (v) => (v === null || v === undefined ? null : Number(v))

const serialize = (row) => {
  const from = row.origin_snapshot.city || row.origin_snapshot.name
  const dest = row.destination_snapshot
  return {
    delivery_order: {
      id: row.delivery_order_id,
      no: row.do_no,
      route: `${from} → ${dest.name}${dest.city ? `, ${dest.city}` : ''}`,
      completed_at: toWib(row.completed_at),
    },
    driver: { id: row.driver_id, code: row.driver_code, name: row.driver_name },
    unit_plate: row.unit_plate,
    type: row.type,
    label: LABELS[row.type],
    amount: num(row.amount),
    travel_allowance: num(row.travel_allowance),
    expense_total: num(row.expense_total),
    distance_km: num(row.distance_km),
    duration_minutes: row.duration_minutes,
    settled: row.settled_at ? {
      at: toWib(row.settled_at),
      by: row.settled_by ? { id: row.settled_by, name: row.settled_by_name } : null,
      note: row.note,
    } : null,
  }
}

const load = async (db, deliveryOrderId) => {
  const row = await repo.findByDeliveryOrder(db, deliveryOrderId)
  if (!row) throw master.notFound('delivery_order_id', deliveryOrderId)
  return row
}

const list = async (db, query) => {
  const paging = pagination.parse(query, SORTABLE, '-completed_at')
  const { rows, totals } = await repo.list(db, {
    search: query.search,
    paging,
    filters: {
      type: query.type,
      settled: query.settled,
      driverId: query.driver_id,
      from: query.from ? new Date(`${query.from}T00:00:00+07:00`) : null,
      to: query.to ? new Date(`${query.to}T23:59:59.999+07:00`) : null,
    },
  })
  return {
    data: rows.map(serialize),
    meta: {
      ...pagination.meta(paging, totals.do_count),
      // Total atas SEMUA hasil filter (bukan hanya halaman ini): bahan rekonsiliasi kas
      summary: {
        refund_total: Number(totals.refund_total),
        payable_total: Number(totals.payable_total),
        unsettled_count: totals.unsettled_count,
      },
    },
  }
}

const get = async (db, deliveryOrderId) => serialize(await load(db, deliveryOrderId))

/** Tandai rekap sudah disetor/dibayar. Setelah itu angkanya terkunci: biaya DO ini tidak bisa lagi dibatalkan. */
const settle = async (db, admin, deliveryOrderId, body) => {
  const row = await load(db, deliveryOrderId)
  if (row.settled_at) {
    throw new AppError('INVALID_STATE', {
      message: `Rekap ${row.do_no} sudah ditandai ${row.type === 'payable_to_driver' ? 'dibayar' : 'disetor'} pada ${toWib(row.settled_at)}.`,
      details: { settled_at: toWib(row.settled_at) },
    })
  }

  await db.transaction(async (trx) => {
    const done = await repo.markSettled(trx, deliveryOrderId, {
      settled_at: body.settled_at || trx.fn.now(), settled_by: admin.id, note: body.note || null, updated_by: admin.id,
    })
    if (!done) throw new AppError('INVALID_STATE', { message: 'Rekap baru saja ditandai oleh admin lain.', details: { settled: true } })
    await doRepo.insertEvent(trx, {
      delivery_order_id: deliveryOrderId,
      event: 'settled',
      from_status: 'completed',
      to_status: 'completed',
      actor_id: admin.id,
      occurred_at: new Date(),
      payload: { type: row.type, amount: Number(row.amount), note: body.note || null },
    })
  })
  return get(db, deliveryOrderId)
}

module.exports = {
  list, get, settle,
}
