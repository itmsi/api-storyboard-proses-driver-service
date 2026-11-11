const { AppError } = require('../../utils/errors')
const { auditFields } = require('../../utils/audit')
const { toWib } = require('../../utils/date')
const pagination = require('../../utils/pagination')
const { fail } = require('../../utils/accounts')
const master = require('../../utils/master')
const { serializeMedia } = require('../media/serializer')
const doRepo = require('./repository')
const repo = require('./manage-repository')

// Pengelolaan DO oleh admin: buat, daftar, detail, ubah (hanya saat belum diterima driver), batalkan.

const SORTABLE = {
  no: 'delivery_orders.no',
  planned_load_at: 'delivery_orders.planned_load_at',
  assigned_at: 'delivery_orders.assigned_at',
  status: 'delivery_orders.status',
  created_at: 'delivery_orders.created_at',
}

const DELIVERY_STATUS = { lengkap: 'terkirim_lengkap', masalah: 'terkirim_catatan', gagal_kirim: 'gagal_kirim' }

const num = (v) => (v === null || v === undefined ? null : Number(v))

const routeLabel = (row) => {
  const from = row.origin_snapshot.city || row.origin_snapshot.name
  const dest = row.destination_snapshot
  return `${from} → ${dest.name}${dest.city ? `, ${dest.city}` : ''}`
}

const serializeListItem = (row) => ({
  id: row.id,
  no: row.no,
  status: row.status,
  delivery_status: row.delivery_status,
  driver: { id: row.driver_id, code: row.driver_code, name: row.driver_name },
  unit: { id: row.unit_id, plate: row.unit_plate, type: row.unit_type },
  customer: row.customer_id ? { id: row.customer_id, name: row.customer_name } : null,
  route: routeLabel(row),
  origin: { name: row.origin_snapshot.name, city: row.origin_snapshot.city || null },
  destination: { name: row.destination_snapshot.name, city: row.destination_snapshot.city || null },
  planned_load_at: toWib(row.planned_load_at),
  assigned_at: toWib(row.assigned_at),
  cargo: { description: row.cargo_description, quantity: num(row.cargo_quantity), unit: row.cargo_unit },
  estimated_distance_km: num(row.estimated_distance_km),
  travel_allowance_amount: num(row.travel_allowance_amount),
  expense_total: num(row.expense_total),
  odometer_start_km: row.odometer_start_km,
  odometer_end_km: row.odometer_end_km,
  distance_km: row.odometer_start_km === null || row.odometer_end_km === null ? null : row.odometer_end_km - row.odometer_start_km,
  accepted_at: toWib(row.accepted_at),
  started_at: toWib(row.started_at),
  completed_at: toWib(row.completed_at),
  cancelled_at: toWib(row.cancelled_at),
  cancel_reason: row.cancel_reason,
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
  const reading = (type) => {
    const o = odometers.find((x) => x.type === type)
    if (!o) return null
    return {
      km: o.effective_km,
      source: o.effective_source,
      fuel_level: o.effective_fuel_level,
      captured_at: toWib(o.captured_at),
      ocr: o.ocr_km === null && o.ocr_fuel_level === null ? null : { km: o.ocr_km, fuel_level: o.ocr_fuel_level },
      correction_reason: o.correction_reason,
    }
  }

  return {
    ...serializeListItem(row),
    origin: { ...row.origin_snapshot, gps: gps(row.origin_snapshot), location_id: row.origin_location_id },
    destination: { ...row.destination_snapshot, gps: gps(row.destination_snapshot), location_id: row.destination_location_id },
    travel_allowance: { amount: num(row.travel_allowance_amount), received_at: toWib(row.travel_allowance_received_at) },
    timeline: events.map((e) => ({
      id: Number(e.id),
      event: e.event,
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
      corrected: Boolean(e.corrected_fields),
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
  name: loc.name, address: loc.address, city: loc.city, lat: num(loc.lat), lng: num(loc.lng),
})

const snapshotDestination = (loc) => ({
  name: loc.name,
  city: loc.city,
  address: loc.address,
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

const list = async (db, query) => {
  const paging = pagination.parse(query, SORTABLE, '-created_at')
  const { rows, total } = await repo.list(db, {
    search: query.search,
    paging,
    filters: {
      status: query.status,
      driverId: query.driver_id,
      unitId: query.unit_id,
      customerId: query.customer_id,
      // Tanggal kalender WIB: from = awal hari, to = akhir hari
      from: query.from ? new Date(`${query.from}T00:00:00+07:00`) : null,
      to: query.to ? new Date(`${query.to}T23:59:59.999+07:00`) : null,
    },
  })
  return { data: rows.map(serializeListItem), meta: pagination.meta(paging, total) }
}

const get = async (db, id) => serializeDetail(db, await load(db, id))

const create = async (db, admin, body) => {
  const refs = await resolveRefs(db, body)
  const no = await repo.nextNumber(db)
  const id = await db.transaction(async (trx) => {
    const created = await repo.insert(trx, {
      no,
      customer_id: refs.customerId,
      driver_id: body.driver_id,
      unit_id: body.unit_id,
      origin_location_id: body.origin_location_id,
      origin_snapshot: snapshotOrigin(refs.origin),
      destination_location_id: body.destination_location_id,
      destination_snapshot: snapshotDestination(refs.destination),
      planned_load_at: body.planned_load_at || null,
      cargo_description: body.cargo.description,
      cargo_quantity: body.cargo.quantity,
      cargo_unit: body.cargo.unit,
      estimated_distance_km: body.estimated_distance_km ?? null,
      travel_allowance_amount: body.travel_allowance_amount ?? 0,
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
      payload: { driver_id: body.driver_id, unit_id: body.unit_id },
    })
    return created
  })
  return get(db, id)
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
  if (row.status !== 'assigned') {
    throw new AppError('INVALID_STATE', {
      message: 'DO yang sudah diterima driver tidak bisa diubah. Batalkan lalu buat DO baru.',
      details: { status: row.status, expected: ['assigned'] },
    })
  }

  const destinationChanged = body.destination_location_id !== undefined
  const cargo = body.cargo || {}
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
  if (cargo.description !== undefined) fields.cargo_description = cargo.description
  if (cargo.quantity !== undefined) fields.cargo_quantity = cargo.quantity
  if (cargo.unit !== undefined) fields.cargo_unit = cargo.unit

  await db.transaction(async (trx) => {
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
  list, get, create, update, cancel,
}
