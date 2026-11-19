const { LABELS: SETTLEMENT_LABELS } = require('../../utils/settlement')

/**
 * Teks timeline DO untuk tampilan admin: tiap kejadian di delivery_order_events diberi `label` (judul) dan `detail` (keterangan).
 * Disusun saat dibaca dari payload kejadian ditambah data DO yang sudah dimuat untuk detail (biaya, odometer, serah terima, P2H), jadi
 * berlaku juga untuk kejadian lama dan tidak perlu kolom baru. Fungsi murni: tanpa akses database.
 */

const money = (value) => `Rp ${String(Math.round(Number(value) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`
const km = (value) => `${String(Math.round(Number(value) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, '.')} km`
const join = (parts) => parts.filter(Boolean).join(' · ') || null

const P2H_TEXT = { layak: 'boleh jalan', catatan: 'boleh jalan dengan catatan', tidak_layak: 'tidak layak jalan' }
const CONDITION_TEXT = { terkirim_lengkap: 'Lengkap', terkirim_catatan: 'Ada catatan', gagal_kirim: 'Gagal kirim' }
const FIELD_TEXT = {
  driver_id: 'driver',
  unit_id: 'unit',
  customer_id: 'customer',
  origin_location_id: 'lokasi asal',
  destination_location_id: 'lokasi tujuan',
  destinations: 'lokasi tujuan',
  planned_load_at: 'jadwal muat',
  travel_allowance_amount: 'uang jalan',
  estimated_distance_km: 'perkiraan jarak',
  cargo_type: 'jenis muatan',
  cargo_details: 'rincian muatan',
}

/** Judul dan tahap (untuk "Tahap terakhir" di daftar DO) per jenis kejadian. stage = null: bukan perubahan tahap. */
const EVENTS = {
  assigned: { label: 'DO ditugaskan', stage: 'Belum diterima' },
  updated: { label: 'DO diubah', stage: null },
  on_hold: { label: 'DO ditahan', stage: 'Ditahan' },
  resumed: { label: 'DO dilanjutkan', stage: 'Belum diterima' },
  accepted: { label: 'DO diterima', stage: 'Diterima' },
  loaded: { label: 'Muat selesai', stage: 'Muat selesai' },
  odometer_start: { label: 'Odometer awal', stage: 'Perjalanan' },
  handover: { label: 'Serah terima', stage: 'Serah terima' },
  odometer_end: { label: 'Odometer akhir', stage: 'Odometer akhir' },
  completed: { label: 'DO selesai', stage: 'Selesai' },
  cancelled: { label: 'DO dibatalkan', stage: 'Dibatalkan' },
  rescheduled: { label: 'DO dijadwalkan ulang', stage: null },
  expense_added: { label: 'Biaya dicatat', stage: null },
  expense_voided: { label: 'Biaya dibatalkan', stage: null },
  settled: { label: 'Rekap uang jalan', stage: null },
}

/** Kejadian yang mengubah tahap (urutan tidak penting; yang terakhir menurut id yang dipakai). */
const STAGE_EVENTS = Object.entries(EVENTS).filter(([, v]) => v.stage).map(([k]) => k)
const stageLabel = (event) => (EVENTS[event] ? EVENTS[event].stage : null)

/**
 * @param {object} event  { event, payload, occurred_at, actor_name }
 * @param {object} ctx    { order, expenses[], handover, p2hById (Map id -> { status }) }
 *   order    : baris DO (driver_name, unit_plate, driver_id, unit_id)
 *   expenses : biaya DO (category_code, category_label, amount, recorded_at, corrected_fields, proof_media_id, voided_at, void_reason)
 * @returns {{ label: string, detail: string|null }}
 */
const describeEvent = (event, ctx = {}) => {
  const p = event.payload || {}
  const base = EVENTS[event.event]
  const order = ctx.order || {}
  const actor = event.actor_name || null

  const expenseOf = () => (ctx.expenses || []).find((e) => e.category_code === p.category
    && Number(e.amount) === Number(p.amount)
    && new Date(e.recorded_at).getTime() === new Date(event.occurred_at).getTime())
  const categoryLabel = (expense) => (expense && expense.category_label) || (p.category ? p.category.toUpperCase() : 'Biaya')

  switch (event.event) {
    case 'assigned': {
      const sameDriver = !p.driver_id || p.driver_id === order.driver_id
      const sameUnit = !p.unit_id || p.unit_id === order.unit_id
      return {
        label: base.label,
        detail: join([sameDriver && order.driver_name, sameUnit && order.unit_plate, p.rescheduled_from && `ulang dari ${p.rescheduled_from.no}`, actor && `oleh ${actor}`]),
      }
    }
    case 'updated': {
      const changed = (p.changed || []).map((k) => FIELD_TEXT[k] || k)
      return { label: base.label, detail: changed.length ? `Diubah: ${changed.join(', ')}` : null }
    }
    case 'on_hold':
      return { label: base.label, detail: join([p.reason, actor && `oleh ${actor}`]) }
    case 'resumed':
      return { label: base.label, detail: join([p.on_hold_reason && `Sebelumnya ditahan: ${p.on_hold_reason}`, actor && `oleh ${actor}`]) }
    case 'rescheduled':
      return { label: base.label, detail: join([p.new_no && `DO baru ${p.new_no}`, actor && `oleh ${actor}`]) }
    case 'cancelled':
      return { label: base.label, detail: join([p.reason, actor && `oleh ${actor}`]) }
    case 'accepted': {
      const p2h = p.p2h_id && ctx.p2hById ? ctx.p2hById.get(p.p2h_id) : null
      return {
        label: base.label,
        detail: join([
          actor,
          p2h && order.unit_plate && `P2H unit ${order.unit_plate} ${P2H_TEXT[p2h.status] || p2h.status}`,
          p.travel_allowance_received === false ? 'uang jalan belum diterima' : (p.travel_allowance_received && 'uang jalan diterima'),
        ]),
      }
    }
    case 'loaded':
      return {
        label: base.label,
        detail: join([
          p.photo_count !== undefined && `${p.photo_count} foto`,
          p.quantity_matches_do === true && 'jumlah sesuai DO',
          p.quantity_matches_do === false && 'jumlah tidak sesuai DO',
          p.note_pages && `surat jalan ${p.note_pages} hal.`,
        ]),
      }
    case 'odometer_start':
    case 'odometer_end':
      return {
        label: base.label,
        detail: join([p.km !== undefined && km(p.km), p.source === 'corrected' ? 'dikoreksi driver' : (p.source && 'OCR, tidak dikoreksi')]),
      }
    case 'expense_added': {
      const expense = expenseOf()
      const corrected = expense && expense.corrected_fields ? Object.keys(expense.corrected_fields).length : 0
      return {
        label: `${categoryLabel(expense)} dicatat`,
        detail: join([
          p.amount !== undefined && money(p.amount),
          corrected ? `${corrected} koreksi` : null,
          expense && !expense.proof_media_id ? 'tanpa bukti' : null,
        ]),
      }
    }
    case 'expense_voided': {
      const expense = (ctx.expenses || []).find((e) => e.id === p.expense_id)
      return {
        label: `${categoryLabel(expense)} dibatalkan`,
        detail: join([p.amount !== undefined && money(p.amount), p.reason, actor && `oleh ${actor}`]),
      }
    }
    case 'handover': {
      const h = ctx.handover
      const text = CONDITION_TEXT[p.delivery_status] || p.delivery_status
      return {
        label: base.label,
        detail: join([
          p.delivery_status === 'terkirim_catatan' && p.issue_count ? `${text} (${p.issue_count} masalah)` : text,
          h && h.receiver_name && `diterima ${h.receiver_name}`,
        ]),
      }
    }
    case 'completed':
      return {
        label: base.label,
        detail: join([
          p.expense_total !== undefined && `Biaya ${money(p.expense_total)}`,
          p.settlement_type && (p.settlement_type === 'balanced' ? SETTLEMENT_LABELS.balanced : `${SETTLEMENT_LABELS[p.settlement_type]} ${money(p.settlement_amount)}`),
        ]),
      }
    case 'settled':
      return {
        label: p.type === 'payable_to_driver' ? 'Dibayar ke driver' : 'Setoran diterima',
        detail: join([p.amount !== undefined && money(p.amount), p.note, actor && `oleh ${actor}`]),
      }
    default:
      return { label: event.event, detail: null }
  }
}

module.exports = {
  describeEvent, stageLabel, STAGE_EVENTS, EVENTS,
}
