const { mapsUrlFor } = require('../../utils/maps')

/**
 * Pemberhentian tujuan DO (satu DO bisa punya banyak tujuan berurutan). Disimpan di delivery_orders.destinations sebagai
 * [{ step, location_id, snapshot }] (snapshot = salinan alamat saat DO dibuat, seperti origin_snapshot). Pemberhentian terakhir
 * juga disalin ke destination_location_id dan destination_snapshot (tujuan akhir), supaya serah terima, daftar, dan filter lama tetap jalan.
 */

/** Pemberhentian berurutan. DO lama tanpa kolom destinations = satu pemberhentian dari kolom destination_*. */
const stopsOf = (row) => {
  const list = Array.isArray(row.destinations) ? row.destinations : []
  if (list.length) return [...list].sort((a, b) => a.step - b.step)
  return [{ step: 1, location_id: row.destination_location_id, snapshot: row.destination_snapshot }]
}

const placeLabel = (snapshot) => `${snapshot.name}${snapshot.city ? `, ${snapshot.city}` : ''}`

/** "Cakung → PT Contoh Jaya, Karawang → Toko Bekasi, Bekasi" */
const routeLabel = (row) => {
  const from = row.origin_snapshot.city || row.origin_snapshot.name
  return `${from} → ${stopsOf(row).map((s) => placeLabel(s.snapshot)).join(' → ')}`
}

const gpsOf = (snapshot) => (snapshot.lat === null || snapshot.lat === undefined ? null : { lat: snapshot.lat, lng: snapshot.lng })

/** Ringkas (daftar DO admin). */
const summary = (stop) => ({
  step: stop.step,
  location_id: stop.location_id,
  name: stop.snapshot.name,
  city: stop.snapshot.city || null,
  maps_url: mapsUrlFor(stop.snapshot),
})

/** Lengkap (detail DO admin): seluruh salinan alamat. */
const full = (stop) => ({
  step: stop.step,
  location_id: stop.location_id,
  ...stop.snapshot,
  gps: gpsOf(stop.snapshot),
  maps_url: mapsUrlFor(stop.snapshot),
})

/** Untuk aplikasi driver. */
const forDriver = (stop) => ({
  step: stop.step,
  name: stop.snapshot.name,
  city: stop.snapshot.city || null,
  address: stop.snapshot.address,
  gps: gpsOf(stop.snapshot),
  operating_hours: stop.snapshot.operating_hours || null,
  pic: stop.snapshot.pic || null,
  maps_url: mapsUrlFor(stop.snapshot),
})

module.exports = {
  stopsOf, routeLabel, summary, full, forDriver,
}
