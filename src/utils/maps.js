/**
 * Tautan Google Maps untuk sebuah lokasi/snapshot lokasi: pakai maps_url yang diisi admin bila ada,
 * kalau kosong dibuat dari koordinat (lat, lng), kalau koordinat juga kosong null.
 */
const mapsUrlFor = (place) => {
  if (!place) return null
  const own = typeof place.maps_url === 'string' ? place.maps_url.trim() : ''
  if (own) return own
  if (place.lat === null || place.lat === undefined || place.lng === null || place.lng === undefined) return null
  return `https://maps.google.com/?q=${place.lat},${place.lng}`
}

module.exports = { mapsUrlFor }
