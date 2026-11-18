const { AppError } = require('../../utils/errors')
const { toWib, wibDate } = require('../../utils/date')
const { LABELS: SETTLEMENT_LABELS } = require('../../utils/settlement')
const manage = require('../delivery-orders/manage-service')
const repo = require('./repository')

const MAX_RANGE_DAYS = 366
const DAY_MS = 24 * 60 * 60 * 1000
const PENDING_SETTLEMENT_LIMIT = 10

// Kelompok status DO di dashboard (urutan = urutan tampil). DO batal tidak masuk total, dilaporkan terpisah.
const DO_BUCKETS = [
  { status: 'assigned', label: 'Ditugaskan' },
  { status: 'onhold', label: 'Ditahan' },
  { status: 'running', label: 'Berjalan' },
  { status: 'completed', label: 'Selesai' },
  { status: 'failed', label: 'Gagal kirim' },
]

const P2H_BUCKETS = [
  { status: 'layak', label: 'Boleh jalan' },
  { status: 'catatan', label: 'Boleh jalan · catatan' },
  { status: 'tidak_layak', label: 'Tidak layak jalan' },
  { status: 'belum', label: 'Belum P2H' },
]
const P2H_LABEL = Object.fromEntries(P2H_BUCKETS.map((b) => [b.status, b.label]))
// Urutan "Perlu perhatian": yang paling mendesak lebih dulu
const ATTENTION_RANK = { tidak_layak: 0, belum: 1, catatan: 2 }

const num = (value) => Number(value || 0)
const percent = (count, total) => (total ? Math.round((count / total) * 100) : 0)

/**
 * start_date/end_date (YYYY-MM-DD, WIB). Tanpa keduanya = hari ini. Hanya start_date = dari tanggal itu sampai hari ini
 * (tombol "7 hari" / "30 hari"); hanya end_date = satu hari itu.
 */
const resolveRange = (query) => {
  const today = wibDate()
  const endDate = query.end_date || (query.start_date && query.start_date > today ? query.start_date : today)
  const startDate = query.start_date || endDate
  const days = (new Date(`${endDate}T00:00:00Z`) - new Date(`${startDate}T00:00:00Z`)) / DAY_MS
  if (days < 0) throw new AppError('VALIDATION_ERROR', { details: [{ field: 'start_date', message: 'start_date tidak boleh setelah end_date.' }] })
  if (days >= MAX_RANGE_DAYS) {
    throw new AppError('VALIDATION_ERROR', { details: [{ field: 'start_date', message: `Rentang maksimal ${MAX_RANGE_DAYS} hari.` }] })
  }
  // P2H berlaku per hari: pakai end_date, tapi tidak melewati hari ini
  const p2hDate = endDate > today ? today : endDate
  return {
    startDate, endDate, days: days + 1, p2hDate,
  }
}

const doStatus = (rows) => {
  const byBucket = {}
  const customers = new Map()
  let cancelled = 0
  rows.forEach((row) => {
    if (row.bucket === 'cancelled') {
      cancelled += row.count
      return
    }
    byBucket[row.bucket] = (byBucket[row.bucket] || 0) + row.count
    const key = row.customer_id || 'none'
    if (!customers.has(key)) {
      customers.set(key, {
        customer: row.customer_id ? { id: row.customer_id, name: row.customer_name } : null, total: 0, counts: {},
      })
    }
    const entry = customers.get(key)
    entry.total += row.count
    entry.counts[row.bucket] = (entry.counts[row.bucket] || 0) + row.count
  })

  const total = Object.values(byBucket).reduce((a, b) => a + b, 0)
  const breakdown = (counts) => DO_BUCKETS
    .filter((b) => counts[b.status])
    .map((b) => ({ status: b.status, label: b.label, count: counts[b.status] }))

  return {
    total,
    cancelled,
    counts: Object.fromEntries(DO_BUCKETS.map((b) => [b.status, byBucket[b.status] || 0])),
    items: DO_BUCKETS.map((b) => ({
      status: b.status, label: b.label, count: byBucket[b.status] || 0, percent: percent(byBucket[b.status] || 0, total),
    })),
    by_customer: [...customers.values()]
      .sort((a, b) => (b.total - a.total) || String((a.customer && a.customer.name) || '~').localeCompare(String((b.customer && b.customer.name) || '~')))
      .map((c) => ({
        customer: c.customer,
        total: c.total,
        percent: percent(c.total, total),
        breakdown: breakdown(c.counts),
      })),
  }
}

const p2hSection = async (db, date) => {
  const units = await repo.unitsP2h(db, date)
  const statusOf = (u) => u.p2h_status || 'belum'
  const attentionUnits = units.filter((u) => statusOf(u) !== 'layak')
  const holding = await repo.doHoldingUnits(db, attentionUnits.map((u) => u.id), date)
  const doByUnit = new Map()
  holding.forEach((d) => { if (!doByUnit.has(d.unit_id)) doByUnit.set(d.unit_id, d) })

  const counts = Object.fromEntries(P2H_BUCKETS.map((b) => [b.status, 0]))
  units.forEach((u) => { counts[statusOf(u)] += 1 })

  return {
    date,
    active_units: units.length,
    counts,
    items: P2H_BUCKETS.map((b) => ({
      status: b.status, label: b.label, count: counts[b.status], percent: percent(counts[b.status], units.length),
    })),
    attention: attentionUnits
      .sort((a, b) => (ATTENTION_RANK[statusOf(a)] - ATTENTION_RANK[statusOf(b)]) || a.plate.localeCompare(b.plate))
      .map((u) => {
        const status = statusOf(u)
        const order = doByUnit.get(u.id)
        return {
          unit: { id: u.id, plate: u.plate, type: u.unit_type },
          status,
          label: P2H_LABEL[status],
          note: u.note || null,
          admin_confirmed_by_driver: u.admin_confirmed_by_driver === null || u.admin_confirmed_by_driver === undefined
            ? null : Boolean(u.admin_confirmed_by_driver),
          recheck_requested: status === 'belum' && Boolean(u.recheck_requested),
          checked_at: toWib(u.checked_at),
          delivery_order: order ? {
            id: order.id, no: order.no, status: order.status, waiting: order.status === 'assigned',
          } : null,
          driver: order ? { id: order.driver_id, name: order.driver_name } : null,
        }
      }),
  }
}

const financeSection = async (db, range) => {
  const [{ allowance, expenses, settlements }, pending] = await Promise.all([
    repo.financeTotals(db, range),
    repo.pendingSettlements(db, range, PENDING_SETTLEMENT_LIMIT),
  ])
  return {
    travel_allowance: { total: num(allowance.travel_allowance_total), do_count: allowance.do_count },
    expenses: {
      total: num(expenses.total),
      receipt_total: num(expenses.receipt_total),
      manual_total: num(expenses.manual_total),
      count: expenses.count,
    },
    refund_to_company: { total: num(settlements.refund_total), unsettled_total: num(settlements.refund_unsettled) },
    payable_to_driver: { total: num(settlements.payable_total), unsettled_total: num(settlements.payable_unsettled) },
    settled_count: settlements.settled_count,
    pending_settlements: {
      count: settlements.pending_count,
      items: pending.map((p) => ({
        delivery_order: {
          id: p.delivery_order_id, no: p.delivery_order_no, completed_at: toWib(p.completed_at), failed_delivery: p.delivery_status === 'gagal_kirim',
        },
        driver: { id: p.driver_id, code: p.driver_code, name: p.driver_name },
        type: p.type,
        label: SETTLEMENT_LABELS[p.type],
        amount: num(p.amount),
      })),
    },
  }
}

/**
 * Ringkasan operasional untuk rentang start_date..end_date. Bagian ringkasan dihitung atas SEMUA DO di rentang;
 * page/limit/search/sort/sort_by berlaku untuk daftar `delivery_orders` (sama dengan POST /delivery-orders/get).
 */
const get = async (db, query) => {
  const range = resolveRange(query)
  const [counts, pendingSync, p2h, finance, orders] = await Promise.all([
    repo.doCounts(db, range),
    repo.pendingSyncCount(db),
    p2hSection(db, range.p2hDate),
    financeSection(db, range),
    manage.list(db, {
      page: query.page,
      limit: query.limit,
      search: query.search,
      sort: query.sort,
      sort_by: query.sort_by,
      from: range.startDate,
      to: range.endDate,
    }),
  ])
  const status = doStatus(counts)

  return {
    data: {
      period: {
        start_date: range.startDate,
        end_date: range.endDate,
        days: range.days,
        generated_at: toWib(new Date()),
      },
      cards: {
        delivery_orders: { total: status.total, not_accepted: status.counts.assigned, on_hold: status.counts.onhold },
        running: { total: status.counts.running, pending_sync: pendingSync },
        completed: { total: status.counts.completed, settled: finance.settled_count },
        failed: { total: status.counts.failed, needs_reschedule: status.counts.failed > 0 },
      },
      do_status: {
        total: status.total,
        cancelled: status.cancelled,
        items: status.items,
        by_customer: status.by_customer,
      },
      p2h,
      finance,
      delivery_orders: orders.data,
    },
    meta: orders.meta,
  }
}

module.exports = { get, resolveRange }
