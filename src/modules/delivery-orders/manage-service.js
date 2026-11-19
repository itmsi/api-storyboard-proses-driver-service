const { AppError } = require('../../utils/errors')
const { auditFields } = require('../../utils/audit')
const { toWib, wibDate } = require('../../utils/date')
const pagination = require('../../utils/pagination')
const { fail } = require('../../utils/accounts')
const master = require('../../utils/master')
const { mapsUrlFor } = require('../../utils/maps')
const { serializeMedia } = require('../media/serializer')
const unitDay = require('./unit-day')
const doRepo = require('./repository')
const repo = require('./manage-repository')
const { resolveSettings } = require('../app/settings')
const cargo = require('./cargo')
const timeline = require('./timeline')
const validation = require('./manage-validation')

// Pengelolaan DO oleh admin: buat, daftar, detail, ubah (hanya saat belum diterima driver), tahan (onhold)/lanjutkan, batalkan.

const SORTABLE = {
  no: 'delivery_orders.no',
  planned_load_at: 'delivery_orders.planned_load_at',
  assigned_at: 'delivery_orders.assigned_at',
  status: 'delivery_orders.status',
  created_at: 'delivery_orders.created_at',
  completed_at: 'delivery_orders.completed_at',
  started_at: 'delivery_orders.started_at',
  driver: 'driver_user.name',
  unit: 'units.plate',
  customer: 'customers.name',
}

const DELIVERY_STATUS = { lengkap: 'terkirim_lengkap', masalah: 'terkirim_catatan', gagal_kirim: 'gagal_kirim' }

const num = (v) => (v === null || v === undefined ? null : Number(v))

/**
 * Tanggal kerja DO (WIB): tanggal rencana muat; tanpa rencana muat = tanggal DO ditugaskan (DO baru: hari ini).
 * Sama dengan DO_WORK_DATE di manage-repository.
 */
const assignmentDate = (plannedLoadAt, assignedAt = null) => wibDate(new Date(plannedLoadAt || assignedAt || Date.now()))

const routeLabel = (row) => {
  const from = row.origin_snapshot.city || row.origin_snapshot.name
  const dest = row.destination_snapshot
  return `${from} → ${dest.name}${dest.city ? `, ${dest.city}` : ''}`
}

/**
 * Tambahan item daftar DO untuk tabel admin, dari data yang sudah ada (tanpa kolom salinan): `last_stage` (tahap terakhir), `flags` (kolom
 * "Catatan"), dan `settlement`. Semuanya diambil dengan satu query per jenis untuk seluruh halaman.
 */
const withListExtras = async (db, rows, items) => {
  if (!rows.length) return items
  const ids = rows.map((r) => r.id)
  const assignedUnits = [...new Set(rows.filter((r) => r.status === 'assigned').map((r) => r.unit_id))]
  const [stages, corrections, settlements, p2h] = await Promise.all([
    repo.lastStages(db, ids, timeline.STAGE_EVENTS),
    repo.correctionCounts(db, ids),
    repo.settlementsOf(db, ids),
    repo.currentP2h(db, assignedUnits, wibDate()),
  ])
  const stageOf = new Map(stages.map((r) => [r.delivery_order_id, r]))
  const correctionsOf = new Map(corrections.map((r) => [r.delivery_order_id, r.count]))
  const settlementOf = new Map(settlements.map((r) => [r.delivery_order_id, r]))
  const p2hOf = new Map(p2h.map((r) => [r.unit_id, r.status]))

  return items.map((item, i) => {
    const row = rows[i]
    const stage = stageOf.get(row.id)
    const corrected = correctionsOf.get(row.id) || 0
    const flags = []
    if (corrected) flags.push({ code: 'correction', label: `${corrected} koreksi`, count: corrected })
    if (row.status === 'assigned' && !p2hOf.has(row.unit_id)) flags.push({ code: 'p2h_missing', label: 'P2H belum' })
    if (row.status === 'assigned' && p2hOf.get(row.unit_id) === 'tidak_layak') flags.push({ code: 'p2h_unfit', label: 'P2H tidak layak' })
    if (row.status === 'completed' && row.delivery_status === 'gagal_kirim' && !row.rescheduled_to_id) {
      flags.push({ code: 'needs_reschedule', label: 'Perlu dijadwalkan ulang' })
    }
    if (row.needs_review) flags.push({ code: 'needs_review', label: 'Perlu dilihat' })
    const settlement = settlementOf.get(row.id)
    let settlementStatus = 'none'
    if (settlement) settlementStatus = settlement.settled_at ? 'settled' : 'pending'
    return {
      ...item,
      last_stage: stage
        ? { code: stage.event, label: timeline.stageLabel(stage.event), at: toWib(stage.occurred_at) }
        : { code: 'assigned', label: timeline.stageLabel('assigned'), at: toWib(row.assigned_at) },
      flags,
      settlement: { status: settlementStatus, ...(settlement ? { type: settlement.type } : {}) },
    }
  })
}

const serializeListItem = (row) => ({
  id: row.id,
  no: row.no,
  document_prefix: row.document_prefix,
  document_number: row.document_number === null || row.document_number === undefined ? null : Number(row.document_number),
  status: row.status,
  delivery_status: row.delivery_status,
  driver: { id: row.driver_id, code: row.driver_code, name: row.driver_name },
  unit: { id: row.unit_id, plate: row.unit_plate, type: row.unit_type },
  // Unit driver pada tanggal kerja DO ini (tanpa tabel penugasan): default = driver bawaan unit, override = pengganti
  unit_assignment: {
    work_date: assignmentDate(row.planned_load_at, row.assigned_at),
    source: row.unit_default_driver_id === row.driver_id ? 'default' : 'override',
  },
  customer: row.customer_id ? { id: row.customer_id, name: row.customer_name } : null,
  customer_reference_no: row.customer_reference_no ?? null,
  route: routeLabel(row),
  origin: { name: row.origin_snapshot.name, city: row.origin_snapshot.city || null, maps_url: mapsUrlFor(row.origin_snapshot) },
  destination: { name: row.destination_snapshot.name, city: row.destination_snapshot.city || null, maps_url: mapsUrlFor(row.destination_snapshot) },
  planned_load_at: toWib(row.planned_load_at),
  assigned_at: toWib(row.assigned_at),
  ...cargo.serialize(row),
  estimated_distance_km: num(row.estimated_distance_km),
  travel_allowance_amount: num(row.travel_allowance_amount),
  expense_total: num(row.expense_total),
  odometer_start_km: row.odometer_start_km,
  odometer_end_km: row.odometer_end_km,
  distance_km: row.odometer_start_km === null || row.odometer_end_km === null ? null : row.odometer_end_km - row.odometer_start_km,
  accepted_at: toWib(row.accepted_at),
  started_at: toWib(row.started_at),
  completed_at: toWib(row.completed_at),
  on_hold_at: toWib(row.on_hold_at),
  on_hold_reason: row.on_hold_reason ?? null,
  cancelled_at: toWib(row.cancelled_at),
  cancel_reason: row.cancel_reason,
  rescheduled_from_id: row.rescheduled_from_id || null, // DO ini adalah DO ulang dari DO gagal kirim itu
  rescheduled_to_id: row.rescheduled_to_id || null, // DO ini sudah dijadwalkan ulang menjadi DO itu
  needs_review: Boolean(row.needs_review), // ada bacaan odometer/struk yang perlu dilihat admin (lihat detail untuk alasannya)
  ...auditFields(row),
})

const gps = (snapshot) => (snapshot.lat === null || snapshot.lat === undefined ? null : { lat: snapshot.lat, lng: snapshot.lng })

const expenseLabel = (e) => {
  if (e.category_input === 'receipt_ocr') {
    const liters = e.liters === null ? '' : ` ${Number(e.liters)} L`
    return `${e.fuel_type || e.category_label}${liters}`.trim()
  }
  return e.description || e.category_label
}

const serializeDetail = async (db, row) => {
  const [events, loading, odometers, expenses, handover, settlement, media] = await Promise.all([
    repo.events(db, row.id),
    repo.loading(db, row.id),
    repo.odometers(db, row.id),
    repo.expenses(db, row.id),
    repo.handover(db, row.id),
    repo.settlement(db, row.id),
    repo.media(db, row.id),
  ])
  const linkIds = [row.rescheduled_from_id, row.rescheduled_to_id].filter(Boolean)
  const linkRefs = new Map((await repo.orderRefs(db, linkIds)).map((r) => [r.id, r]))
  const p2hById = new Map((await repo.p2hByIds(db, [...new Set(events.map((e) => e.payload && e.payload.p2h_id).filter(Boolean))])).map((r) => [r.id, r]))
  // Foto dan status pengecekan AI bacaan/struk, diambil sekali untuk semuanya (dua query, bukan per baris)
  const [photoRows, checkRows] = await Promise.all([
    repo.mediaByIds(db, [...odometers.map((o) => o.media_id), ...expenses.map((e) => e.proof_media_id)].filter(Boolean)),
    repo.aiChecksByIds(db, [...odometers.map((o) => o.ai_check_id), ...expenses.map((e) => e.ai_check_id)].filter(Boolean)),
  ])
  const photoOf = (id) => {
    const m = photoRows.find((x) => x.id === id)
    return m ? serializeMedia(m) : null
  }
  const checkOf = (id) => checkRows.find((c) => c.id === id) || null
  const aiState = (check, values) => {
    if (!check) return null
    // Nilai dari hasil sebelumnya tetap tampil selama dibaca ulang (status queued/processing) atau bila pembacaan ulang gagal
    const present = Object.values(values).some((v) => v !== null && v !== undefined)
    return {
      status: check.status,
      ...(check.status === 'done' || present ? values : {}),
      ...(check.display_mode ? { display_mode: check.display_mode } : {}), // odo | trip: layar asal km (ODO didahulukan bila keduanya ada)
      ...(check.odo_km !== null && check.odo_km !== undefined ? { odo_km: check.odo_km } : {}),
      ...(check.trip_km !== null && check.trip_km !== undefined ? { trip_km: check.trip_km } : {}),
      ...(check.fuel_percent !== null && check.fuel_percent !== undefined ? { fuel_percent: check.fuel_percent } : {}), // persen bahan bakar yang tertulis di LCD
      ...(check.extras ? { extras: check.extras } : {}), // bacaan lain di dashboard (AdBlue, voltase, tekanan, lampu peringatan, teks LCD, dan lainnya)
      ...(check.note ? { note: check.note } : {}), // alasan AI bila ada yang tidak terbaca
      ...(check.status === 'failed' ? { error: { code: check.error_code, message: check.error_message } } : {}),
    }
  }

  const reading = (type) => {
    const o = odometers.find((x) => x.type === type)
    if (!o) return null
    const corrected = o.corrected_km === null && o.corrected_fuel_level === null ? null : {
      ...(o.corrected_km === null ? {} : { km: o.corrected_km }),
      ...(o.corrected_fuel_level === null ? {} : { fuel_level: o.corrected_fuel_level }),
    }
    return {
      km: o.effective_km,
      source: o.effective_source,
      fuel_level: o.effective_fuel_level,
      captured_at: toWib(o.captured_at),
      // Tiga nilai terpisah untuk dicek admin terhadap foto: OCR FE, AI (pembanding, tidak pernah jadi nilai efektif), dan koreksi driver
      photo: photoOf(o.media_id),
      ocr: o.ocr_km === null && o.ocr_fuel_level === null ? null : { km: o.ocr_km, fuel_level: o.ocr_fuel_level },
      ai: aiState(checkOf(o.ai_check_id), { km: o.ai_km, fuel_level: o.ai_fuel_level, confidence: num(o.ai_confidence) }),
      corrected,
      correction_reason: o.correction_reason,
      needs_review: o.needs_review,
      review_reasons: o.review_reasons,
    }
  }

  return {
    ...serializeListItem(row),
    origin: {
      ...row.origin_snapshot, gps: gps(row.origin_snapshot), maps_url: mapsUrlFor(row.origin_snapshot), location_id: row.origin_location_id,
    },
    destination: {
      ...row.destination_snapshot, gps: gps(row.destination_snapshot), maps_url: mapsUrlFor(row.destination_snapshot), location_id: row.destination_location_id,
    },
    travel_allowance: { amount: num(row.travel_allowance_amount), received_at: toWib(row.travel_allowance_received_at) },
    rescheduled_from: row.rescheduled_from_id ? linkRefs.get(row.rescheduled_from_id) || { id: row.rescheduled_from_id, no: null } : null,
    rescheduled_to: row.rescheduled_to_id ? linkRefs.get(row.rescheduled_to_id) || { id: row.rescheduled_to_id, no: null } : null,
    timeline: events.map((e) => ({
      id: Number(e.id),
      event: e.event,
      ...timeline.describeEvent(e, {
        order: row, expenses, handover, p2hById,
      }),
      from_status: e.from_status,
      to_status: e.to_status,
      occurred_at: toWib(e.occurred_at),
      actor: e.actor_id ? { id: e.actor_id, name: e.actor_name, role: e.actor_role } : null,
      gps: e.lat === null ? null : { lat: num(e.lat), lng: num(e.lng) },
      payload: e.payload,
    })),
    loading: !loading ? null : {
      loaded_at: toWib(loading.loaded_at),
      quantity_matches_do: loading.quantity_matches_do,
      quantity_note: loading.quantity_note,
      photo_count: loading.photo_count,
    },
    odometer: { start: reading('start'), end: reading('end') },
    expenses: expenses.map((e) => ({
      id: e.id,
      category: e.category_code,
      label: expenseLabel(e),
      amount: num(e.amount),
      has_proof: Boolean(e.proof_media_id),
      proof_photo: e.proof_media_id ? photoOf(e.proof_media_id) : null,
      corrected: Boolean(e.corrected_fields),
      // Struk BBM: tiga nilai terpisah (OCR FE, AI pembanding, koreksi driver) untuk dicek admin terhadap foto
      ...(e.category_input === 'receipt_ocr' ? {
        receipt: {
          ocr: e.ocr_fields,
          ai: aiState(checkOf(e.ai_check_id), { fields: e.ai_fields, confidence: num(e.ai_confidence) }),
          corrected: e.corrected_fields,
          correction_reason: e.correction_reason,
        },
      } : {}),
      needs_review: e.needs_review,
      review_reasons: e.review_reasons,
      checks: e.checks,
      voided: Boolean(e.voided_at),
      void_reason: e.void_reason,
      recorded_at: toWib(e.recorded_at),
    })),
    handover: !handover ? null : {
      id: handover.id,
      condition: handover.condition,
      delivery_status: DELIVERY_STATUS[handover.condition],
      receiver_name: handover.receiver_name,
      signed_at: toWib(handover.signed_at),
      received_quantity: num(handover.received_quantity),
      acknowledges_issues: handover.acknowledges_issues,
      failure_reason: handover.failure_reason,
      note: handover.note,
      recorded_at: toWib(handover.recorded_at),
      issues: handover.issues.map((i) => ({
        type: i.type, quantity: num(i.quantity), unit: i.unit, note: i.note, photo_count: i.photo_count,
      })),
    },
    settlement: !settlement ? null : {
      type: settlement.type,
      amount: num(settlement.amount),
      travel_allowance: num(settlement.travel_allowance),
      expense_total: num(settlement.expense_total),
      distance_km: num(settlement.distance_km),
      duration_minutes: settlement.duration_minutes,
      settled_at: toWib(settlement.settled_at),
      settled_by: settlement.settled_by || null,
      note: settlement.note,
    },
    media: media.map((m) => ({ ...serializeMedia(m), purpose: m.purpose, page_no: m.page_no })),
  }
}

const load = async (db, id) => {
  const row = await repo.findById(db, id)
  if (!row) throw master.notFound('delivery_order_id', id)
  return row
}

const snapshotOrigin = (loc) => ({
  name: loc.name, address: loc.address, city: loc.city, maps_url: loc.maps_url || null, lat: num(loc.lat), lng: num(loc.lng),
})

const snapshotDestination = (loc) => ({
  name: loc.name,
  city: loc.city,
  address: loc.address,
  maps_url: loc.maps_url || null,
  lat: num(loc.lat),
  lng: num(loc.lng),
  operating_hours: loc.operating_hours,
  pic: { name: loc.pic_name, phone: loc.pic_phone },
})

/**
 * Periksa semua rujukan pada data DO yang sudah lengkap (buat baru, atau gabungan data lama + perubahan):
 * driver dan unit harus aktif, lokasi ada, dan customer harus sesuai dengan lokasi tujuan.
 * Mengembalikan baris-baris rujukan dan customer_id akhir (diturunkan dari lokasi tujuan jika tidak dipilih).
 */
const resolveRefs = async (db, data) => {
  const [driver, unit, origin, destination] = await Promise.all([
    repo.findDriver(db, data.driver_id),
    repo.findUnit(db, data.unit_id),
    repo.findLocation(db, data.origin_location_id),
    repo.findLocation(db, data.destination_location_id),
  ])
  if (!driver) throw fail('driver_id', 'Driver tidak ditemukan.')
  if (driver.user_status !== 'active' || driver.driver_status !== 'active') throw fail('driver_id', 'Driver sedang dinonaktifkan.')
  if (!unit) throw fail('unit_id', 'Unit tidak ditemukan.')
  if (unit.status !== 'active') throw fail('unit_id', `Unit ${unit.plate} tidak aktif (${unit.status}).`)
  if (!origin) throw fail('origin_location_id', 'Lokasi asal tidak ditemukan.')
  if (!destination) throw fail('destination_location_id', 'Lokasi tujuan tidak ditemukan.')
  if (origin.id === destination.id) throw fail('destination_location_id', 'Lokasi tujuan tidak boleh sama dengan lokasi asal.')

  let customerId = data.customer_id || destination.customer_id || null
  if (data.customer_id) {
    if (!(await repo.findCustomer(db, data.customer_id))) throw fail('customer_id', 'Customer tidak ditemukan.')
    if (destination.customer_id && destination.customer_id !== data.customer_id) {
      throw fail('customer_id', 'Customer tidak sesuai dengan lokasi tujuan.')
    }
    customerId = data.customer_id
  }
  return {
    driver, unit, origin, destination, customerId,
  }
}

/** Filter status: satu nilai, array, atau kelompok (running, open) -> daftar status unik. */
const expandStatuses = (input) => {
  if (!input) return []
  const values = Array.isArray(input) ? input : [input]
  return [...new Set(values.flatMap((v) => validation.STATUS_GROUPS[v] || [v]))]
}

const list = async (db, query) => {
  const paging = pagination.parse(query, SORTABLE, 'created_at')
  const { rows, total } = await repo.list(db, {
    search: query.search,
    paging,
    filters: {
      statuses: expandStatuses(query.status),
      deliveryStatus: query.delivery_status,
      settlementStatus: query.settlement_status,
      originLocationId: query.origin_location_id,
      destinationLocationId: query.destination_location_id,
      completedFrom: query.completed_from ? new Date(`${query.completed_from}T00:00:00+07:00`) : null,
      completedTo: query.completed_to ? new Date(`${query.completed_to}T23:59:59.999+07:00`) : null,
      driverId: query.driver_id,
      unitId: query.unit_id,
      customerId: query.customer_id,
      needsReview: query.needs_review,
      // Tanggal kalender WIB: from = awal hari, to = akhir hari
      from: query.from ? new Date(`${query.from}T00:00:00+07:00`) : null,
      to: query.to ? new Date(`${query.to}T23:59:59.999+07:00`) : null,
    },
  })
  return { data: await withListExtras(db, rows, rows.map(serializeListItem)), meta: pagination.meta(paging, total) }
}

const get = async (db, id) => serializeDetail(db, await load(db, id))

const ddmmyyyy = (date) => date.split('-').reverse().join('-')

/**
 * Aturan satu driver satu unit per tanggal, dilihat dari DO-nya:
 * driver tidak boleh punya dua DO dengan unit berbeda pada tanggal kerja yang sama.
 *
 * Contoh (driver A, tanggal 16-11-2026):
 *   DO1 unit AA assigned + DO2 unit AA  → boleh (unit sama)
 *   DO1 unit AA assigned + DO2 unit BB  → 409; DO1 harus di-onhold dulu, baru DO2 bisa di-assign
 *   DO1 unit AA onhold/cancelled + DO2 unit BB → boleh (DO1 tidak lagi memakai hari kerja driver)
 *   DO1 unit AA sudah diterima/berjalan/selesai + DO2 unit BB → 409; tidak bisa di-onhold, gunakan unit AA atau ganti driver
 *
 * Dipanggil di dalam transaksi setelah baris driver dikunci (lockDriver), supaya dua admin tidak lolos bersamaan.
 */
const assertDriverDayFree = async (trx, {
  driver, unitId, workDate, exceptId = null, orderNo = null,
}) => {
  const rows = await repo.findDriverOrdersOnDate(trx, {
    driverId: driver.id, date: workDate, exceptId,
  })
  const clashes = rows.filter((r) => r.unit_id !== unitId)
  if (!clashes.length) return

  const tanggal = ddmmyyyy(workDate)
  const target = orderNo || 'DO ini'
  const details = {
    reason: 'driver_beda_unit_tanggal_sama',
    work_date: workDate,
    driver: { id: driver.id, code: driver.code, name: driver.name },
    conflicting_orders: clashes.map((r) => ({
      id: r.id, no: r.no, status: r.status, unit: { id: r.unit_id, plate: r.unit_plate }, can_hold: r.status === 'assigned',
    })),
  }

  // DO yang sudah diterima/berjalan/selesai tidak bisa di-onhold
  const locked = clashes.find((r) => r.status !== 'assigned')
  if (locked) {
    throw new AppError('CONFLICT', {
      message: `Maaf, Delivery Order tidak bisa di-assign karena driver ${driver.name} sudah `
        + `${locked.status === 'completed' ? 'menyelesaikan' : 'menjalankan'} ${locked.no} dengan unit ${locked.unit_plate} `
        + `pada tanggal ${tanggal}. DO tersebut tidak bisa di-onhold; gunakan unit ${locked.unit_plate} atau ganti driver.`,
      details,
    })
  }

  const nos = clashes.map((r) => r.no).join(', ')
  throw new AppError('CONFLICT', {
    message: `Maaf, Delivery Order tidak bisa di-assign karena driver ${driver.name} sudah memiliki DO dengan unit yang berbeda `
      + `pada tanggal yang sama (${clashes.map((r) => `${r.no} unit ${r.unit_plate}`).join(', ')}, ${tanggal}). `
      + `Silakan ubah status ${nos} menjadi 'onhold' agar ${target} dapat di-assign.`,
    details,
  })
}

/** Kunci baris driver selama transaksi: pemeriksaan "satu unit per tanggal" dan penyimpanan DO jadi berurutan per driver. */
const lockDriver = (trx, driverId) => trx('drivers').where({ id: driverId }).forUpdate().first('id')

/**
 * Buat dan tugaskan DO. `from` (opsional) = DO gagal kirim asal DO ulang: DO baru menunjuk asalnya dan asalnya menunjuk DO baru,
 * dalam satu transaksi (bila asalnya ternyata sudah dijadwalkan ulang, tidak ada yang dibuat).
 */
const create = async (db, admin, body, { from = null } = {}) => {
  const [refs, settings] = await Promise.all([resolveRefs(db, body), resolveSettings(db)])
  const workDate = assignmentDate(body.planned_load_at)
  const id = await db.transaction(async (trx) => {
    await lockDriver(trx, body.driver_id)
    await assertDriverDayFree(trx, { driver: refs.driver, unitId: body.unit_id, workDate })
    // Unit tidak boleh sedang dipegang driver lain pada tanggal itu; bentrok = DO tidak dibuat
    await unitDay.ensureUnitFree(trx, {
      driverId: body.driver_id, unitId: body.unit_id, unit: refs.unit, workDate,
    })
    // Nomor DO = document_prefix (pengaturan) + document_number (auto increment di database); `no` dibentuk database
    const created = await repo.insert(trx, {
      document_prefix: settings.document_prefix,
      customer_id: refs.customerId,
      customer_reference_no: body.customer_reference_no || null,
      driver_id: body.driver_id,
      unit_id: body.unit_id,
      origin_location_id: body.origin_location_id,
      origin_snapshot: snapshotOrigin(refs.origin),
      destination_location_id: body.destination_location_id,
      destination_snapshot: snapshotDestination(refs.destination),
      planned_load_at: body.planned_load_at || null,
      cargo_type: null,
      cargo_details: null,
      ...cargo.toColumns(body),
      estimated_distance_km: body.estimated_distance_km ?? null,
      travel_allowance_amount: body.travel_allowance_amount ?? 0,
      rescheduled_from_id: from ? from.id : null,
      assigned_by: admin.id,
      created_by: admin.id,
      updated_by: admin.id,
    })
    await doRepo.insertEvent(trx, {
      delivery_order_id: created,
      event: 'assigned',
      from_status: null,
      to_status: 'assigned',
      actor_id: admin.id,
      occurred_at: new Date(),
      payload: { driver_id: body.driver_id, unit_id: body.unit_id, ...(from ? { rescheduled_from: { id: from.id, no: from.no } } : {}) },
    })
    if (from) {
      // Nomor DO dibentuk database (document_prefix + document_number), jadi dibaca dari baris yang baru dibuat
      const { no: newNo } = await trx('delivery_orders').where({ id: created }).first('no')
      const linked = await trx('delivery_orders').where({ id: from.id }).whereNull('rescheduled_to_id')
        .update({ rescheduled_to_id: created, updated_by: admin.id })
      if (!linked) throw new AppError('INVALID_STATE', { message: `DO ${from.no} sudah dijadwalkan ulang.`, details: { reason: 'sudah_dijadwalkan_ulang' } })
      await doRepo.insertEvent(trx, {
        delivery_order_id: from.id,
        event: 'rescheduled',
        from_status: from.status,
        to_status: from.status,
        actor_id: admin.id,
        occurred_at: new Date(),
        payload: { new_order_id: created, new_no: newNo },
      })
    }
    return created
  })
  return get(db, id)
}

/**
 * DO ulang dari DO yang gagal kirim (selesai dengan hasil gagal_kirim): DO baru berstatus assigned, disalin dari DO asal (driver, unit,
 * lokasi, muatan, uang jalan), dengan jadwal muat baru dan field lain yang boleh diganti lewat body. Satu DO hanya bisa dijadwalkan ulang sekali.
 */
const reschedule = async (db, admin, id, body) => {
  const row = await load(db, id)
  if (row.status !== 'completed' || row.delivery_status !== 'gagal_kirim') {
    throw new AppError('INVALID_STATE', {
      message: 'Hanya DO yang gagal kirim yang bisa dijadwalkan ulang.',
      details: { status: row.status, delivery_status: row.delivery_status, expected: 'completed dengan hasil gagal_kirim' },
    })
  }
  if (row.rescheduled_to_id) {
    const [next] = await repo.orderRefs(db, [row.rescheduled_to_id])
    throw new AppError('INVALID_STATE', {
      message: `DO ${row.no} sudah dijadwalkan ulang${next ? ` (${next.no})` : ''}.`,
      details: { reason: 'sudah_dijadwalkan_ulang', rescheduled_to_id: row.rescheduled_to_id },
    })
  }
  const merged = {
    driver_id: row.driver_id,
    unit_id: row.unit_id,
    origin_location_id: row.origin_location_id,
    destination_location_id: row.destination_location_id,
    estimated_distance_km: row.estimated_distance_km === null ? null : Number(row.estimated_distance_km),
    travel_allowance_amount: Number(row.travel_allowance_amount),
    cargo_type: row.cargo_type,
    cargo_details: row.cargo_details,
    customer_reference_no: row.customer_reference_no,
    ...body,
  }
  return create(db, admin, merged, { from: row })
}

/** Status yang tidak boleh diubah/dibatalkan lagi, dengan pesan yang tepat. */
const assertEditable = (row) => {
  if (row.status === 'cancelled') throw new AppError('DO_CANCELLED')
  if (row.status === 'completed') throw new AppError('DO_LOCKED')
}

/**
 * Ubah DO hanya selagi belum diterima driver (assigned). Setelah berjalan, data DO adalah bukti kerja driver,
 * jadi koreksinya lewat pembatalan lalu pembuatan DO baru.
 */
const update = async (db, admin, id, body) => {
  const row = await load(db, id)
  assertEditable(row)
  if (row.status === 'onhold') {
    throw new AppError('INVALID_STATE', {
      message: 'DO sedang onhold. Lanjutkan dulu (resume) sebelum diubah.',
      details: { status: row.status, expected: ['assigned'] },
    })
  }
  if (row.status !== 'assigned') {
    throw new AppError('INVALID_STATE', {
      message: 'DO yang sudah diterima driver tidak bisa diubah. Batalkan lalu buat DO baru.',
      details: { status: row.status, expected: ['assigned'] },
    })
  }

  const destinationChanged = body.destination_location_id !== undefined
  const merged = {
    driver_id: body.driver_id ?? row.driver_id,
    unit_id: body.unit_id ?? row.unit_id,
    origin_location_id: body.origin_location_id ?? row.origin_location_id,
    destination_location_id: body.destination_location_id ?? row.destination_location_id,
    customer_id: row.customer_id,
  }
  // Tujuan baru tanpa customer eksplisit: customer diturunkan lagi dari tujuan itu
  if (body.customer_id !== undefined) merged.customer_id = body.customer_id
  else if (destinationChanged) merged.customer_id = null
  const refs = await resolveRefs(db, merged)

  const fields = { updated_by: admin.id, customer_id: refs.customerId };
  ['driver_id', 'unit_id', 'origin_location_id', 'destination_location_id', 'planned_load_at', 'estimated_distance_km', 'travel_allowance_amount'].forEach((k) => {
    if (body[k] !== undefined) fields[k] = body[k]
  })
  if (body.origin_location_id !== undefined) fields.origin_snapshot = snapshotOrigin(refs.origin)
  if (destinationChanged) fields.destination_snapshot = snapshotDestination(refs.destination)
  if (body.customer_reference_no !== undefined) fields.customer_reference_no = body.customer_reference_no || null
  Object.assign(fields, cargo.toColumns(body))

  await db.transaction(async (trx) => {
    // Driver, unit, atau tanggal muat berubah: periksa kombinasi barunya
    if (['driver_id', 'unit_id', 'planned_load_at'].some((k) => body[k] !== undefined)) {
      const planned = body.planned_load_at !== undefined ? body.planned_load_at : row.planned_load_at
      const workDate = assignmentDate(planned, row.assigned_at)
      await lockDriver(trx, merged.driver_id)
      await assertDriverDayFree(trx, {
        driver: refs.driver, unitId: merged.unit_id, workDate, exceptId: id, orderNo: row.no,
      })
      await unitDay.ensureUnitFree(trx, {
        driverId: merged.driver_id, unitId: merged.unit_id, unit: refs.unit, workDate, exceptOrderId: id,
      })
    }
    const done = await doRepo.updateIfStatus(trx, id, ['assigned'], fields)
    if (!done) throw new AppError('INVALID_STATE', { message: 'DO baru saja diterima driver dan tidak bisa diubah lagi.', details: { expected: ['assigned'] } })
    await doRepo.insertEvent(trx, {
      delivery_order_id: id,
      event: 'updated',
      from_status: 'assigned',
      to_status: 'assigned',
      actor_id: admin.id,
      occurred_at: new Date(),
      payload: { changed: Object.keys(body) },
    })
  })
  return get(db, id)
}

/**
 * Tahan DO (assigned → onhold). Hanya selagi belum diterima driver. DO onhold hilang dari aplikasi driver, tidak bisa diterima,
 * dan tidak lagi memakai hari kerja driver: driver boleh mendapat DO lain dengan unit berbeda pada tanggal yang sama.
 */
const hold = async (db, admin, id, { reason = null } = {}) => {
  const row = await load(db, id)
  assertEditable(row)
  if (row.status === 'onhold') throw new AppError('INVALID_STATE', { message: 'DO ini sudah onhold.', details: { status: 'onhold' } })
  if (row.status !== 'assigned') {
    throw new AppError('INVALID_STATE', {
      message: 'Hanya DO yang belum diterima driver (assigned) yang bisa di-onhold.',
      details: { status: row.status, expected: ['assigned'] },
    })
  }

  await db.transaction(async (trx) => {
    const done = await doRepo.updateIfStatus(trx, id, ['assigned'], {
      status: 'onhold', on_hold_at: trx.fn.now(), on_hold_reason: reason, updated_by: admin.id,
    })
    if (!done) throw new AppError('INVALID_STATE', { message: 'DO baru saja diterima driver dan tidak bisa di-onhold lagi.', details: { expected: ['assigned'] } })
    await doRepo.insertEvent(trx, {
      delivery_order_id: id,
      event: 'on_hold',
      from_status: 'assigned',
      to_status: 'onhold',
      actor_id: admin.id,
      occurred_at: new Date(),
      payload: { reason },
    })
  })
  return get(db, id)
}

/**
 * Lanjutkan DO yang ditahan (onhold → assigned). Aturan satu driver satu unit per tanggal diperiksa lagi, jadi bila driver sudah
 * mendapat DO lain dengan unit berbeda pada tanggal itu, DO lain tersebut harus di-onhold dulu (409).
 */
const resume = async (db, admin, id) => {
  const row = await load(db, id)
  assertEditable(row)
  if (row.status !== 'onhold') {
    throw new AppError('INVALID_STATE', { message: 'Hanya DO onhold yang bisa dilanjutkan.', details: { status: row.status, expected: ['onhold'] } })
  }
  const refs = await resolveRefs(db, { ...row, customer_id: null }) // driver/unit/lokasi bisa saja sudah dinonaktifkan selama DO ditahan
  const workDate = assignmentDate(row.planned_load_at, row.assigned_at)

  await db.transaction(async (trx) => {
    await lockDriver(trx, row.driver_id)
    await assertDriverDayFree(trx, {
      driver: refs.driver, unitId: row.unit_id, workDate, exceptId: id, orderNo: row.no,
    })
    await unitDay.ensureUnitFree(trx, {
      driverId: row.driver_id, unitId: row.unit_id, unit: refs.unit, workDate, exceptOrderId: id,
    })
    const done = await doRepo.updateIfStatus(trx, id, ['onhold'], {
      status: 'assigned', on_hold_at: null, on_hold_reason: null, updated_by: admin.id,
    })
    if (!done) throw new AppError('INVALID_STATE', { message: 'Status DO baru saja berubah, muat ulang lalu coba lagi.', details: { expected: ['onhold'] } })
    await doRepo.insertEvent(trx, {
      delivery_order_id: id,
      event: 'resumed',
      from_status: 'onhold',
      to_status: 'assigned',
      actor_id: admin.id,
      occurred_at: new Date(),
      payload: { on_hold_reason: row.on_hold_reason },
    })
  })
  return get(db, id)
}

/** Batalkan DO yang belum selesai. Foto, biaya, dan jejak yang sudah ada tidak dihapus. */
const cancel = async (db, admin, id, { reason }) => {
  const row = await load(db, id)
  if (row.status === 'completed') throw new AppError('DO_LOCKED')
  if (row.status === 'cancelled') throw new AppError('INVALID_STATE', { message: 'DO ini sudah dibatalkan.', details: { status: 'cancelled' } })

  await db.transaction(async (trx) => {
    const done = await doRepo.updateIfStatus(trx, id, master.OPEN_DO_STATUSES, {
      status: 'cancelled', cancelled_at: trx.fn.now(), cancel_reason: reason, updated_by: admin.id,
    })
    if (!done) throw new AppError('INVALID_STATE', { message: 'Status DO baru saja berubah, muat ulang lalu coba lagi.', details: { status: row.status } })
    await doRepo.insertEvent(trx, {
      delivery_order_id: id,
      event: 'cancelled',
      from_status: row.status,
      to_status: 'cancelled',
      actor_id: admin.id,
      occurred_at: new Date(),
      payload: { reason },
    })
  })
  return get(db, id)
}

module.exports = {
  list, get, create, reschedule, update, hold, resume, cancel,
}
