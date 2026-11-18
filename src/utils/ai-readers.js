const { readImage } = require('./vision')

/**
 * Pembaca per jenis foto: perintah (prompt), skema ketat, dan normalisasi hasilnya. Bentuk hasil sengaja SAMA dengan hasil OCR
 * dari FE (ocr_km, ocr_fuel_level, dan field struk BBM di modul expenses) supaya ketiga nilai (OCR FE, AI, koreksi driver) bisa dibandingkan
 * langsung. Nilai yang tidak masuk akal dibuang menjadi null; hasil AI hanya pembanding dan tidak pernah menjadi nilai efektif.
 */

const FUEL_LEVELS = ['empty', 'quarter', 'half', 'three_quarter', 'full']
const MAX_KM = 9999999 // sama dengan batas validasi odometer

// ---------- helper normalisasi ----------

const int = (value, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) => {
  const n = typeof value === 'number' ? value : NaN
  return Number.isInteger(n) && n >= min && n <= max ? n : null
}

const decimal = (value, { min = 0, max = Number.MAX_SAFE_INTEGER, places = 2 } = {}) => {
  const n = typeof value === 'number' ? value : NaN
  if (!Number.isFinite(n) || n <= min || n > max) return null
  return Number(n.toFixed(places))
}

const text = (value, max = 80) => {
  if (typeof value !== 'string') return null
  const clean = value.trim().replace(/\s+/g, ' ').slice(0, max)
  return clean || null
}

const confidence = (value) => {
  const n = typeof value === 'number' ? value : NaN
  return Number.isFinite(n) ? Math.min(1, Math.max(0, Number(n.toFixed(2)))) : null
}

const time = (value) => (typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value.trim()) ? value.trim() : null)

const date = (value) => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value.trim())) return null
  const d = new Date(`${value.trim()}T00:00:00Z`)
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== value.trim() ? null : value.trim()
}

// ---------- dashboard unit (odometer + indikator bahan bakar) ----------

// Batas tingkat bahan bakar dari pecahan 0..1 (jarum atau jumlah balok yang menyala). Sama untuk semua foto, supaya pembulatan tidak
// bergantung pada selera model: model hanya melaporkan pecahannya, tingkatnya ditetapkan di sini.
const FUEL_LEVEL_BOUNDS = [
  { level: 'empty', below: 0.125 },
  { level: 'quarter', below: 0.375 },
  { level: 'half', below: 0.625 },
  { level: 'three_quarter', below: 0.875 },
  { level: 'full', below: Infinity },
]
const fuelLevelOf = (fraction) => {
  if (typeof fraction !== 'number' || !Number.isFinite(fraction) || fraction < 0 || fraction > 1) return null
  return FUEL_LEVEL_BOUNDS.find((b) => fraction < b.below).level
}

const DASHBOARD_INSTRUCTION = [
  'You read a photo of a truck or vehicle dashboard taken by a driver in Indonesia. Work carefully and only report what you can actually see.',
  'The instrument cluster often has a multi-page LCD. Depending on the page it may show an odometer, a trip meter, fuel information, or only a menu or other data. Report only what the current page shows.',
  'Step 1: find the distance readings on the LCD. The total odometer is labelled "ODO" and the trip meter "Trip" (also TRIP A / TRIP B). Both can be shown at the same time (e.g. "Trip: 10.4km  ODO: 10km").',
  'Step 2: transcribe each one separately, character by character, separated by single spaces, ignoring the unit: "odo_digits" for the total odometer (e.g. "4 5 2 7 8") and "trip_digits" for the trip meter (e.g. "1 0 . 4").',
  'Use null for the one that is not shown. Never put the trip value in odo_digits or the other way round. Values such as "total hours", "fuel cons", "L/100km", "bar", "V" or "km/h" are NOT distances.',
  'Write "?" for any digit you cannot read with certainty, and never invent or complete digits. Keep the decimal point if the display shows one.',
  'Step 3: fuel in the tank. Prefer the digital value on the LCD if present: a percentage next to a fuel-pump icon is the diesel/fuel tank level ("fuel_percent", 0-100).',
  'Do NOT confuse it with AdBlue (urea, labelled "AdBlue", usually with a different drop icon). Do NOT use "total fuel", "fuel cons", "L/h" or "L/100km": they are consumption figures, not the tank level.',
  'If there is no digital percentage, read the analog fuel gauge (needle between E/0 and F/1) or a row of bars: "fuel_fraction" between 0 (empty) and 1 (full): the needle position along the arc, or lit bars divided by total bars.',
  'Fill only the one you used and set the other to null. Look closely at the needle tip or at each bar. Use null for both if no tank fuel indication is visible.',
  'Return "confidence": between 0 and 1, how sure you are that the values you returned are correct. Use null if every reading is null.',
  'Return "note": one short sentence (max 100 characters, English) when something is null or uncertain (e.g. "LCD shows a settings menu", "digits are blurred by glare"), or to say which fuel source you used; otherwise null.',
  'Reply only with JSON that matches the schema.',
].join('\n')

// Bidang bukti (transkripsi digit, persen, pecahan) diisi lebih dulu supaya model menuliskan apa yang ia lihat sebelum menyimpulkan.
const DASHBOARD_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['odo_digits', 'trip_digits', 'fuel_percent', 'fuel_fraction', 'confidence', 'note'],
  properties: {
    odo_digits: { type: ['string', 'null'] },
    trip_digits: { type: ['string', 'null'] },
    fuel_percent: { type: ['number', 'null'] },
    fuel_fraction: { type: ['number', 'null'] },
    confidence: { type: ['number', 'null'] },
    note: { type: ['string', 'null'] },
  },
}

// Transkripsi dari model berspasi antar karakter ("1 0 . 4" agar tidak menebak); yang disimpan dan ditampilkan ke admin dirapatkan ("10.4")
const compactDigits = (value) => text(String(value).replace(/\s+/g, ''), 30)

/**
 * Jarak dari transkripsi digit: hanya bila SEMUA digit terbaca (tanpa "?"). Mengembalikan { km (bulat), exact (dengan desimal bila ada) }.
 */
const distanceOf = (raw, { decimals }) => {
  if (typeof raw !== 'string') return null
  const m = raw.replace(/\s+/g, '').match(/^(\d{1,8})(?:[.,](\d{1,2}))?$/)
  if (!m) return null
  const whole = int(Number(m[1]), { max: MAX_KM })
  if (whole === null) return null
  return { km: whole, exact: decimals && m[2] ? Number(`${m[1]}.${m[2]}`) : whole }
}

// Keyakinan hanya bermakna untuk nilai yang terbaca: bila tidak ada yang terbaca, keyakinan dikosongkan (model kadang menjawab
// "yakin" bahwa tidak ada yang terbaca, yang menyesatkan bila dibaca sebagai keyakinan atas hasil). Catatan alasan hanya dibawa bila ada.
const normalizeDashboard = (raw) => {
  // Jawaban gaya lama: satu transkripsi (digits_seen) dengan penanda layarnya
  const legacy = typeof raw.digits_seen === 'string' && raw.odo_digits === undefined && raw.trip_digits === undefined
  const legacyIsTrip = legacy && raw.display_mode === 'trip'
  const odoText = legacy && !legacyIsTrip ? raw.digits_seen : raw.odo_digits
  const tripText = legacyIsTrip ? raw.digits_seen : raw.trip_digits
  const odo = distanceOf(odoText, { decimals: false })
  const trip = distanceOf(tripText, { decimals: true })
  // km yang dibandingkan dengan bacaan driver: odometer total bila terbaca, kalau tidak trip meter (driver boleh memotret layar mana pun)
  const distance = odo || trip
  const noDistanceField = raw.digits_seen === undefined && raw.odo_digits === undefined
  let km = distance ? distance.km : null
  if (!distance && noDistanceField) km = int(raw.km, { max: MAX_KM })

  // Persen di LCD didahulukan; pecahan dari model (dibuat tingkat di sini); jawaban gaya lama membawa tingkatnya langsung
  const percent = typeof raw.fuel_percent === 'number' && raw.fuel_percent >= 0 && raw.fuel_percent <= 100 ? Math.round(raw.fuel_percent) : null
  const fraction = percent !== null ? percent / 100 : raw.fuel_fraction
  let fuel = null
  if (typeof fraction === 'number') fuel = fuelLevelOf(fraction)
  else if (FUEL_LEVELS.includes(raw.fuel_level)) fuel = raw.fuel_level

  const note = text(raw.note, 120)
  const hasAny = km !== null || fuel !== null
  return {
    km,
    fuel_level: fuel,
    confidence: hasAny ? confidence(raw.confidence) : null,
    // Layar asal km, dan kedua bacaan jarak bila ada (ODO bulat, Trip satu desimal) beserta transkripsinya untuk admin
    ...(distance ? { display_mode: odo ? 'odo' : 'trip' } : {}),
    ...(odo ? { odo_km: odo.km, odo_digits: compactDigits(odoText) } : {}),
    ...(trip ? { trip_km: trip.exact, trip_digits: compactDigits(tripText) } : {}),
    ...(percent !== null ? { fuel_percent: percent } : {}),
    ...(note ? { note } : {}),
  }
}

// ---------- struk BBM ----------

const RECEIPT_INSTRUCTION = [
  'You read a photo of a fuel station receipt (SPBU, e.g. Pertamina, Shell, BP, Vivo) taken by a driver in Indonesia.',
  'Amounts are in Indonesian Rupiah. In Indonesian number format "." is the thousands separator and "," is the decimal separator:',
  '"Rp 263.500" means 263500 and "12,50 L" means 12.5.',
  'Return "total": the total amount paid in rupiah as an integer. "liters": the fuel volume in litres. "price_per_liter": the price per litre in rupiah as an integer.',
  'Return "fuel_type": the fuel product name as printed (e.g. Pertalite, Solar, Dexlite, Pertamax). "merchant": the station name or number as printed.',
  'Return "date" as YYYY-MM-DD and "time" as HH:mm (24 hours) exactly as printed on the receipt.',
  'Use null for anything that is not printed or not clearly readable. Never calculate or guess a value that is not on the receipt.',
  'Return "confidence": between 0 and 1, how sure you are that the non-null values you returned are correct. Use null if every value is null.',
  'Return "note": a short sentence (max 100 characters, English) only when something important is null or unclear, saying why; otherwise null.',
  'Reply only with JSON that matches the schema.',
].join('\n')

const RECEIPT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['total', 'liters', 'price_per_liter', 'fuel_type', 'merchant', 'date', 'time', 'confidence', 'note'],
  properties: {
    total: { type: ['integer', 'null'] },
    liters: { type: ['number', 'null'] },
    price_per_liter: { type: ['integer', 'null'] },
    fuel_type: { type: ['string', 'null'] },
    merchant: { type: ['string', 'null'] },
    date: { type: ['string', 'null'] },
    time: { type: ['string', 'null'] },
    confidence: { type: ['number', 'null'] },
    note: { type: ['string', 'null'] },
  },
}

// Batas kewajaran sama dengan validasi struk di modul expenses
const normalizeReceipt = (raw) => {
  const out = {
    total: int(raw.total, { max: 1000000000 }),
    liters: decimal(raw.liters, { max: 100000 }),
    price_per_liter: int(raw.price_per_liter, { min: 1, max: 10000000 }),
    fuel_type: text(raw.fuel_type, 40),
    merchant: text(raw.merchant, 80),
    date: date(raw.date),
    time: time(raw.time),
  }
  const note = text(raw.note, 120)
  // Keyakinan kosong bila tidak ada nilai yang terbaca (lihat normalizeDashboard)
  return {
    ...out,
    confidence: Object.values(out).every((v) => v === null) ? null : confidence(raw.confidence),
    ...(note ? { note } : {}),
  }
}

// ---------- pembaca ----------

const READERS = {
  dashboard: {
    instruction: DASHBOARD_INSTRUCTION, schemaName: 'dashboard_reading', schema: DASHBOARD_SCHEMA, normalize: normalizeDashboard,
  },
  receipt: {
    instruction: RECEIPT_INSTRUCTION, schemaName: 'fuel_receipt_reading', schema: RECEIPT_SCHEMA, normalize: normalizeReceipt,
  },
}

/** Jenis pembacaan menurut `kind` foto di tabel media. null = foto jenis itu tidak dibaca AI. */
const readerKindForMedia = (mediaKind) => {
  if (mediaKind === 'odometer_start' || mediaKind === 'odometer_end') return 'dashboard'
  if (mediaKind === 'receipt') return 'receipt'
  return null
}

/**
 * Baca satu foto yang sudah disiapkan (ai-image.loadImageForAi).
 * @param {'dashboard'|'receipt'} kind
 * @returns {Promise<{ result: object, raw: object, model: string, usage: object|null }>}
 */
const read = async (kind, {
  apiKey, image, model, timeoutMs, baseUrl
}) => {
  const reader = READERS[kind]
  if (!reader) throw new Error(`Jenis pembacaan tidak dikenal: ${kind}`)
  const { data, model: usedModel, usage } = await readImage({
    apiKey, image, instruction: reader.instruction, schemaName: reader.schemaName, schema: reader.schema, model, timeoutMs, baseUrl,
  })
  return {
    result: reader.normalize(data), raw: data, model: usedModel, usage,
  }
}

module.exports = {
  read, readerKindForMedia, normalizeDashboard, normalizeReceipt, FUEL_LEVELS, READERS,
}
