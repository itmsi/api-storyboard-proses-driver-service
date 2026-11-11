const { AppError } = require('../../utils/errors')
const { auditFields } = require('../../utils/audit')
const { toWib } = require('../../utils/date')
const pagination = require('../../utils/pagination')
const storage = require('../../utils/storage')
const master = require('../../utils/master')
const { settle } = require('../../utils/settlement')
const doRepo = require('../delivery-orders/repository')
const driverRepo = require('./repository')
const repo = require('./manage-repository')

// Pengelolaan biaya oleh admin: lihat bukti dan hasil pemeriksaan, dan membatalkan biaya yang tidak sah.

const SORTABLE = {
  recorded_at: 'expenses.recorded_at', amount: 'expenses.amount', category: 'expenses.category_code', created_at: 'expenses.created_at',
}

const num = (v) => (v === null || v === undefined ? null : Number(v))
const hhmm = (v) => (v ? String(v).slice(0, 5) : null)

const label = (e) => {
  if (e.category_input === 'receipt_ocr') {
    const liters = e.liters === null ? '' : ` ${Number(e.liters)} L`
    return `${e.fuel_type || e.category_label}${liters}`.trim()
  }
  return e.description || e.category_label
}

const serialize = (e) => ({
  id: e.id,
  delivery_order: { id: e.delivery_order_id, no: e.do_no, status: e.do_status },
  driver: { id: e.driver_id, code: e.driver_code, name: e.driver_name },
  category: { code: e.category_code, label: e.category_label },
  label: label(e),
  amount: num(e.amount),
  description: e.description,
  proof: e.proof_key ? { url: storage.publicUrl(e.proof_key), thumb_url: e.proof_thumb_key ? storage.publicUrl(e.proof_thumb_key) : null } : null,
  receipt: e.category_input === 'receipt_ocr' ? {
    fuel_type: e.fuel_type,
    liters: num(e.liters),
    price_per_liter: num(e.price_per_liter),
    time: hhmm(e.receipt_time),
    ocr: e.ocr_fields,
    corrected: e.corrected_fields,
    correction_reason: e.correction_reason,
    checks: e.checks,
  } : null,
  gps: e.lat === null ? null : { lat: num(e.lat), lng: num(e.lng) },
  recorded_at: toWib(e.recorded_at),
  voided: e.voided_at ? {
    at: toWib(e.voided_at),
    by: e.voided_by ? { id: e.voided_by, name: e.voided_by_name } : null,
    reason: e.void_reason,
  } : null,
  ...auditFields(e),
})

const load = async (db, id) => {
  const row = await repo.findById(db, id)
  if (!row) throw master.notFound('expense_id', id)
  return row
}

const list = async (db, query) => {
  const paging = pagination.parse(query, SORTABLE, '-recorded_at')
  const { rows, total } = await repo.list(db, {
    search: query.search,
    paging,
    filters: {
      deliveryOrderId: query.delivery_order_id,
      driverId: query.driver_id,
      category: query.category,
      voided: query.voided,
      from: query.from ? new Date(`${query.from}T00:00:00+07:00`) : null,
      to: query.to ? new Date(`${query.to}T23:59:59.999+07:00`) : null,
    },
  })
  return { data: rows.map(serialize), meta: pagination.meta(paging, total) }
}

const get = async (db, id) => serialize(await load(db, id))

/**
 * Batalkan biaya (mis. struk palsu atau salah catat). Total biaya DO dihitung ulang. Untuk DO yang sudah selesai,
 * rekap keuangannya ikut dihitung ulang, selama belum ditandai sudah disetor/dibayar (setelah itu angkanya sudah
 * jadi dasar transaksi uang dan tidak boleh berubah diam-diam).
 */
const voidExpense = async (db, admin, id, { reason }) => {
  const row = await load(db, id)
  if (row.voided_at) throw new AppError('INVALID_STATE', { message: 'Biaya ini sudah dibatalkan.', details: { voided: true } })

  const settlement = await repo.findSettlement(db, row.delivery_order_id)
  if (settlement && settlement.settled_at) {
    throw new AppError('CONFLICT', {
      message: `Biaya tidak bisa dibatalkan: rekap uang jalan ${row.do_no} sudah ditandai ${settlement.type === 'payable_to_driver' ? 'dibayar' : 'disetor'}.`,
      details: { reason: 'rekap_sudah_lunas', delivery_order_no: row.do_no },
    })
  }

  await db.transaction(async (trx) => {
    const marked = await repo.markVoided(trx, id, admin.id, reason)
    if (!marked) throw new AppError('INVALID_STATE', { message: 'Biaya ini sudah dibatalkan.', details: { voided: true } })

    await driverRepo.refreshDoTotal(trx, row.delivery_order_id, admin.id)
    if (settlement) {
      const totals = await repo.orderTotals(trx, row.delivery_order_id)
      const result = settle(Number(totals.travel_allowance_amount), Number(totals.expense_total))
      await repo.updateSettlement(trx, row.delivery_order_id, {
        expense_total: Number(totals.expense_total), type: result.type, amount: result.amount, updated_by: admin.id,
      })
    }
    await doRepo.insertEvent(trx, {
      delivery_order_id: row.delivery_order_id,
      event: 'expense_voided',
      from_status: row.do_status,
      to_status: row.do_status,
      actor_id: admin.id,
      occurred_at: new Date(),
      payload: {
        expense_id: id, category: row.category_code, amount: Number(row.amount), reason,
      },
    })
  })
  return get(db, id)
}

module.exports = {
  list, get, voidExpense,
}
