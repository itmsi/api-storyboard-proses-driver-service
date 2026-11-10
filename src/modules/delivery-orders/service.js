const { AppError } = require('../../utils/errors')
const { auditFields } = require('../../utils/audit')
const { toWib, wibDate } = require('../../utils/date')
const p2h = require('../p2h/service')
const { getPending } = require('../sync/pending')
const repo = require('./repository')

const MAX_RANGE_DAYS = 366
const DEFAULT_RANGE_DAYS = 30
const DAY_MS = 24 * 60 * 60 * 1000

const num = (value) => (value === null || value === undefined ? null : Number(value))
const gpsOf = (snapshot) => (snapshot.lat === null || snapshot.lat === undefined ? null : { lat: snapshot.lat, lng: snapshot.lng })

const mapsUrl = (snapshot) => (gpsOf(snapshot) ? `https://maps.google.com/?q=${snapshot.lat},${snapshot.lng}` : null)

/** "Cakung → PT Contoh Jaya, Karawang" */
const routeLabel = (row) => {
  const from = row.origin_snapshot.city || row.origin_snapshot.name
  const dest = row.destination_snapshot
  return `${from} → ${dest.name}${dest.city ? `, ${dest.city}` : ''}`
}

const serialize = (row, extra = {}) => ({
  id: row.id,
  no: row.no,
  status: row.status,
  assigned_at: toWib(row.assigned_at),
  assigned_by: row.assigned_by,
  unit: { id: row.unit_id, plate: row.unit_plate, type: row.unit_type },
  driver: {
    id: row.driver_id, code: row.driver_code, name: row.driver_name, phone: row.driver_phone,
  },
  origin: {
    name: row.origin_snapshot.name,
    address: row.origin_snapshot.address,
    gps: gpsOf(row.origin_snapshot),
    load_time: toWib(row.planned_load_at),
  },
  destination: {
    name: row.destination_snapshot.name,
    city: row.destination_snapshot.city || null,
    address: row.destination_snapshot.address,
    gps: gpsOf(row.destination_snapshot),
    operating_hours: row.destination_snapshot.operating_hours || null,
    pic: row.destination_snapshot.pic || null,
    maps_url: mapsUrl(row.destination_snapshot),
  },
  cargo: { description: row.cargo_description, quantity: num(row.cargo_quantity), unit: row.cargo_unit },
  estimated_distance_km: num(row.estimated_distance_km),
  travel_allowance: {
    amount: num(row.travel_allowance_amount),
    currency: 'IDR',
    received_confirmed: Boolean(row.travel_allowance_received_at),
  },
  ...extra,
  ...auditFields(row),
})

/**
 * Untuk DO yang belum diterima: sertakan status P2H unit hari ini dan apakah DO boleh diterima sekarang.
 * can_accept = status assigned + unit sudah P2H & boleh beroperasi + tidak ada DO lain yang sedang berjalan.
 */
const withAcceptInfo = async (db, rows) => {
  const today = wibDate()
  const hasActive = Boolean(rows.length && await repo.findActive(db, rows[0].driver_id))
  const p2hByUnit = new Map()

  return Promise.all(rows.map(async (row) => {
    if (row.status !== 'assigned') return serialize(row)
    if (!p2hByUnit.has(row.unit_id)) p2hByUnit.set(row.unit_id, await p2h.getStatus(db, row.unit_id, today))
    const status = p2hByUnit.get(row.unit_id)
    return serialize(row, {
      p2h_today: status.status === 'belum'
        ? { status: 'belum', ...(status.recheck_requested ? { recheck_requested: true } : {}) }
        : { status: status.status, checked_by: status.checked_by, checked_at: status.checked_at },
      can_accept: status.can_operate && !hasActive,
    })
  }))
}

const listAssigned = async (db, auth, status) => {
  const statuses = status ? [status] : ['assigned', ...repo.ACTIVE_STATUSES]
  const rows = await repo.list(db, auth.driver_id, statuses)
  const data = await withAcceptInfo(db, rows)
  return { data, meta: { count: data.length } }
}

const getById = async (db, auth, id) => {
  const row = await repo.findOwned(db, auth.driver_id, id)
  if (!row) throw new AppError('NOT_FOUND', { details: { delivery_order_id: id } })
  const [data] = await withAcceptInfo(db, [row])
  return data
}

// Urutan langkah di layar Berjalan
const STEPS = [
  { code: 'loading', label: 'Muat' },
  { code: 'odometer_start', label: 'Odometer awal' },
  { code: 'in_transit', label: 'Perjalanan' },
  { code: 'handover', label: 'Serah terima' },
  { code: 'odometer_end', label: 'Odometer akhir' },
  { code: 'complete', label: 'Selesai' },
]

/** Langkah yang sedang dikerjakan, diturunkan dari status DO. */
const currentStepIndex = (row) => {
  switch (row.status) {
    case 'accepted': return 0
    case 'loading': return 1
    case 'in_transit': return 2
    case 'handover': return row.odometer_end_km === null ? 4 : 5
    default: return STEPS.length
  }
}

const listActive = async (db, auth) => {
  const rows = await repo.list(db, auth.driver_id, repo.ACTIVE_STATUSES)
  const data = rows.map((row) => {
    const current = currentStepIndex(row)
    let state = 'todo'
    return {
      id: row.id,
      no: row.no,
      route: routeLabel(row),
      status: row.status,
      started_at: toWib(row.started_at),
      odometer_start_km: row.odometer_start_km,
      expense_total: num(row.expense_total),
      steps: STEPS.map((step, index) => {
        if (index < current) state = 'done'
        else if (index === current) state = 'current'
        else state = 'todo'
        return { ...step, state }
      }),
    }
  })
  // Data offline yang gagal tersinkron: milik DO yang sedang berjalan atau tanpa DO (mis. P2H)
  const activeIds = new Set(rows.map((r) => r.id))
  const pending = (await getPending(db, auth.sub)).filter((p) => !p.delivery_order_id || activeIds.has(p.delivery_order_id))
  return { data, meta: { pending_sync: pending.map(({ type, label, client_created_at: at }) => ({ type, label, client_created_at: at })) } }
}

const encodeCursor = (row) => Buffer.from(JSON.stringify({ t: new Date(row.completed_at).toISOString(), id: row.id })).toString('base64url')

const decodeCursor = (value) => {
  try {
    const { t, id } = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'))
    if (Number.isNaN(new Date(t).getTime()) || typeof id !== 'string') throw new Error('bad cursor')
    return { completedAt: t, id }
  } catch (err) {
    throw new AppError('VALIDATION_ERROR', { details: [{ field: 'cursor', message: 'Cursor tidak valid.' }] })
  }
}

const history = async (db, auth, query) => {
  const to = query.to || wibDate()
  const from = query.from || wibDate(new Date(new Date(`${to}T00:00:00+07:00`).getTime() - DEFAULT_RANGE_DAYS * DAY_MS))
  const range = (new Date(`${to}T00:00:00+07:00`) - new Date(`${from}T00:00:00+07:00`)) / DAY_MS
  if (range < 0) throw new AppError('VALIDATION_ERROR', { details: [{ field: 'from', message: 'from tidak boleh setelah to.' }] })
  if (range > MAX_RANGE_DAYS) {
    throw new AppError('VALIDATION_ERROR', { details: [{ field: 'from', message: `Rentang maksimal ${MAX_RANGE_DAYS} hari.` }] })
  }

  const bounds = { from: new Date(`${from}T00:00:00+07:00`), to: new Date(`${to}T23:59:59.999+07:00`) }
  const limit = query.limit || 20
  const cursor = query.cursor ? decodeCursor(query.cursor) : null

  const [rows, summary] = await Promise.all([
    repo.history(db, auth.driver_id, { ...bounds, limit, cursor }),
    repo.historySummary(db, auth.driver_id, bounds),
  ])
  const hasMore = rows.length > limit
  const page = hasMore ? rows.slice(0, limit) : rows

  return {
    data: page.map((row) => ({
      id: row.id,
      no: row.no,
      date: wibDate(row.completed_at),
      route: routeLabel(row),
      distance_km: row.odometer_end_km === null || row.odometer_start_km === null ? null : row.odometer_end_km - row.odometer_start_km,
      unit_plate: row.unit_plate,
      expense_total: num(row.expense_total),
      delivery_status: row.delivery_status,
    })),
    meta: {
      from,
      to,
      limit,
      next_cursor: hasMore ? encodeCursor(page[page.length - 1]) : null,
      has_more: hasMore,
      summary: {
        do_count: Number(summary.do_count),
        distance_km: Number(summary.distance_km),
        expense_total: Number(summary.expense_total),
      },
    },
  }
}

const acceptResult = (row) => ({
  id: row.id,
  status: row.status,
  travel_allowance: {
    amount: num(row.travel_allowance_amount),
    received_confirmed: Boolean(row.travel_allowance_received_at),
    confirmed_at: toWib(row.travel_allowance_received_at),
  },
  next_step: 'loading',
})

const accept = async (db, auth, id, body) => {
  // Kirim ulang dari HP (offline sync): hasil sama, tidak error "sudah diterima"
  const sent = await repo.findEventByClientRef(db, auth.sub, body.client_ref)
  if (sent) {
    if (sent.delivery_order_id !== id) throw new AppError('CONFLICT', { details: { reason: 'client_ref dipakai untuk DO lain' } })
    return { result: acceptResult(await repo.findOwned(db, auth.driver_id, id)), created: false }
  }

  const row = await repo.findOwned(db, auth.driver_id, id)
  if (!row) throw new AppError('NOT_FOUND', { details: { delivery_order_id: id } })
  if (row.status === 'completed') throw new AppError('DO_LOCKED')
  if (row.status !== 'assigned') throw new AppError('INVALID_STATE', { details: { status: row.status, expected: 'assigned' } })

  const date = wibDate()
  const p2hStatus = await p2h.getStatus(db, row.unit_id, date)
  if (p2hStatus.status === 'belum' || !p2hStatus.can_operate) {
    throw new AppError('P2H_REQUIRED', {
      message: p2hStatus.status === 'tidak_layak'
        ? `Unit ${row.unit_plate} dinyatakan tidak layak jalan. Lakukan P2H ulang setelah diperbaiki.`
        : `Unit ${row.unit_plate} belum di-P2H hari ini. DO baru bisa diterima setelah P2H.`,
      details: { unit_id: row.unit_id, p2h_date: date, ...(p2hStatus.status === 'tidak_layak' ? { p2h_status: 'tidak_layak' } : {}) },
    })
  }

  const active = await repo.findActive(db, auth.driver_id)
  if (active) throw new AppError('INVALID_STATE', { details: { reason: 'masih ada DO berjalan', active_do_id: active.id, active_do_no: active.no } })

  if (Number(row.travel_allowance_amount) > 0 && !body.travel_allowance_received) {
    throw new AppError('VALIDATION_ERROR', {
      details: [{ field: 'travel_allowance_received', message: 'Konfirmasi uang jalan sudah diterima wajib untuk DO ini.' }],
    })
  }

  const updated = await db.transaction(async (trx) => {
    await repo.findOwnedForUpdate(trx, auth.driver_id, id)
    const done = await repo.markAccepted(trx, id, {
      status: 'accepted',
      accepted_at: body.accepted_at,
      travel_allowance_received_at: body.travel_allowance_received ? body.accepted_at : null,
      updated_by: auth.sub,
    })
    if (!done) throw new AppError('INVALID_STATE', { details: { reason: 'status DO sudah berubah' } })
    await repo.insertEvent(trx, {
      delivery_order_id: id,
      event: 'accepted',
      from_status: 'assigned',
      to_status: 'accepted',
      actor_id: auth.sub,
      occurred_at: body.accepted_at,
      lat: body.gps ? body.gps.lat : null,
      lng: body.gps ? body.gps.lng : null,
      payload: { travel_allowance_received: Boolean(body.travel_allowance_received), p2h_id: p2hStatus.p2h_id },
      client_ref: body.client_ref,
    })
    return done
  })

  return { result: acceptResult(updated), created: true }
}

/** DO milik driver ini; selain itu NOT_FOUND (DO driver lain tidak dibedakan dari DO yang tidak ada). */
const requireOwned = async (db, auth, id) => {
  const row = await repo.findOwned(db, auth.driver_id, id)
  if (!row) throw new AppError('NOT_FOUND', { details: { delivery_order_id: id } })
  return row
}

/** Langkah perjalanan hanya valid pada status tertentu. DO selesai/terkunci = DO_LOCKED. */
const assertStatus = (row, allowed) => {
  if (row.status === 'completed' || row.locked_at) throw new AppError('DO_LOCKED')
  if (!allowed.includes(row.status)) throw new AppError('INVALID_STATE', { details: { status: row.status, expected: allowed } })
}

module.exports = {
  listAssigned, getById, listActive, history, accept, requireOwned, assertStatus,
}
