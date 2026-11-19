const Joi = require('joi')
const { listQuery } = require('../../utils/pagination')
const cargo = require('./cargo')

// Validasi pengelolaan DO oleh admin (buat, daftar, ubah, batalkan). Validasi untuk driver ada di validation.js.

/**
 * Siklus status Delivery Order (DO). Alur normal:
 *   assigned → accepted → loading → in_transit → handover → completed
 * Admin bisa menahan DO yang belum diterima: assigned ⇄ onhold.
 * Dari status mana pun sebelum completed, admin bisa membatalkan → cancelled.
 *
 * - assigned   : DO baru dibuat admin dan ditugaskan ke driver + unit, belum diterima driver.
 *                Satu-satunya status yang datanya masih boleh diubah admin (manage-service update).
 *                Driver bisa menerima jika unit sudah P2H hari ini & layak operasi, dan driver
 *                tidak sedang punya DO aktif lain.
 *                Aturan: satu driver hanya boleh punya DO dengan SATU unit per tanggal kerja
 *                (tanggal rencana muat WIB). DO kedua dengan unit berbeda ditolak 409 sampai DO pertama di-onhold.
 * - onhold     : DO ditahan admin (assigned → onhold, POST /:id/hold). Tidak tampil & tidak bisa diterima driver,
 *                dan tidak memakai hari kerja driver, sehingga driver boleh mendapat DO lain dengan unit berbeda
 *                di tanggal yang sama. Dilanjutkan dengan POST /:id/resume (→ assigned, aturan unit diperiksa lagi)
 *                atau dibatalkan (→ cancelled).
 * - accepted   : Driver sudah menerima DO (assigned → accepted). DO mulai dihitung "aktif"
 *                (satu driver hanya boleh punya satu DO aktif). Langkah berikutnya: muat barang.
 * - loading    : Driver sudah mencatat muat barang (foto muatan + surat jalan) di lokasi asal
 *                (accepted → loading, modul loading). Langkah berikutnya: odometer awal.
 * - in_transit : Driver sudah mencatat odometer awal, perjalanan dimulai; started_at dan
 *                odometer_start_km terisi (loading → in_transit, modul odometer type=start).
 * - handover   : Barang sudah diserahterimakan di tujuan (surat jalan berstempel, tanda tangan
 *                penerima, kondisi barang → delivery_status) (in_transit → handover, modul handover).
 *                Status tetap handover saat odometer akhir dicatat (odometer_end_km terisi).
 * - completed  : Driver menyelesaikan DO setelah odometer akhir tercatat (handover → completed,
 *                modul summary). completed_at & locked_at terisi; DO terkunci (DO_LOCKED),
 *                tidak bisa diubah maupun dibatalkan.
 * - cancelled  : DO dibatalkan admin (beserta cancel_reason & cancelled_at) dari status apa pun
 *                selain completed. Final: tidak bisa diubah, driver berhenti mengerjakannya (DO_CANCELLED).
 *
 * Status aktif (dikerjakan driver): accepted, loading, in_transit, handover. Status tertahan: onhold.
 * Status final: completed, cancelled.
 */
const STATUSES = ['assigned', 'onhold', 'accepted', 'loading', 'in_transit', 'handover', 'completed', 'cancelled']

const date = Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).custom((value, helpers) => (
  Number.isNaN(new Date(`${value}T00:00:00Z`).getTime()) ? helpers.error('any.invalid') : value
)).messages({ 'string.pattern.base': 'Format tanggal harus YYYY-MM-DD.' })

// Kelompok status untuk filter: running = sudah diterima driver dan belum selesai; open = semua yang belum final (termasuk onhold)
const STATUS_GROUPS = { running: ['accepted', 'loading', 'in_transit', 'handover'], open: ['assigned', 'onhold', 'accepted', 'loading', 'in_transit', 'handover'] }
const statusValue = Joi.string().valid(...STATUSES, ...Object.keys(STATUS_GROUPS))
const DELIVERY_STATUSES = ['terkirim_lengkap', 'terkirim_catatan', 'gagal_kirim']
const SETTLEMENT_STATUSES = ['none', 'pending', 'settled']

const list = listQuery.keys({
  // Satu status, beberapa status (array), atau kelompok (running, open)
  status: Joi.alternatives().try(statusValue, Joi.array().items(statusValue).min(1).unique()),
  driver_id: Joi.string().guid(),
  unit_id: Joi.string().guid(),
  customer_id: Joi.string().guid(),
  origin_location_id: Joi.string().guid(),
  destination_location_id: Joi.string().guid(),
  delivery_status: Joi.string().valid(...DELIVERY_STATUSES), // hasil serah terima (hanya DO yang sudah diserahterimakan)
  settlement_status: Joi.string().valid(...SETTLEMENT_STATUSES), // none = belum ada rekap, pending = rekap belum disetor/dibayar, settled = sudah
  needs_review: Joi.boolean(), // hanya DO yang punya bacaan odometer/struk bertanda perlu dilihat (true) atau yang tidak (false)
  from: date, // tanggal jadwal muat (WIB)
  to: date,
  completed_from: date, // tanggal selesai (WIB)
  completed_to: date,
})

const fields = {
  customer_id: Joi.string().guid().allow(null),
  // Nomor referensi dari customer, mis. no PO (opsional)
  customer_reference_no: Joi.string().trim().max(100).allow(null, ''),
  driver_id: Joi.string().guid(),
  unit_id: Joi.string().guid(),
  origin_location_id: Joi.string().guid(),
  destination_location_id: Joi.string().guid(),
  planned_load_at: Joi.date().iso().allow(null),
  estimated_distance_km: Joi.number().min(0).max(100000).allow(null),
  travel_allowance_amount: Joi.number().integer().min(0).max(1000000000),
  // Muatan (opsional): jenis + rincian bebas [{ label, value }]
  ...cargo.schema,
}

const create = Joi.object({
  ...fields,
  driver_id: fields.driver_id.required(),
  unit_id: fields.unit_id.required(),
  origin_location_id: fields.origin_location_id.required(),
  destination_location_id: fields.destination_location_id.required(),
})

// DO ulang dari DO gagal kirim: semua field boleh diganti, sisanya disalin dari DO asal. Jadwal muat baru wajib.
const reschedule = Joi.object({
  ...fields,
  planned_load_at: Joi.date().iso().required(),
})

// Parsial: hanya field yang dikirim yang berubah. cargo_details dikirim = diganti seluruhnya; null / [] = dikosongkan.
const update = Joi.object({
  ...fields,
}).min(1)

const cancel = Joi.object({
  reason: Joi.string().trim().min(3).max(300)
    .required(),
})

const hold = Joi.object({
  reason: Joi.string().trim().min(3).max(300)
    .allow(null),
})

module.exports = {
  list, create, reschedule, update, hold, cancel, STATUSES, STATUS_GROUPS, DELIVERY_STATUSES, SETTLEMENT_STATUSES,
}
