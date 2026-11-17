const { readImage } = require('./vision')

/**
 * Pembaca per jenis foto: perintah (prompt), skema jawaban ketat, dan normalisasi hasilnya. Bentuk hasil sengaja SAMA dengan hasil OCR
 * dari FE (ocr_km, ocr_fuel_level, dan field struk BBM di modul expenses) supaya ketiga nilai (OCR FE, AI, koreksi driver) bisa dibandingkan
 * langsung. Nilai yang tidak masuk akal dibuang menjadi null; hasil AI hanya pembanding dan tidak pernah menjadi nilai efektif.
 */

const FUEL_LEVELS = ['empty', 'quarter', 'half', 'three_quarter', 'full']
const MAX_KM = 9999999 // sama dengan batas validasi odometer
const DISPLAY_MODES = ['odo', 'trip', 'unknown'] // layar yang dibaca: odometer total, trip meter, atau tidak jelas

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
  'Step 1: find the odometer LCD (the distance display). It may show the total odometer (ODO) or a trip meter (TRIP / TRIP A / TRIP B); read it either way.',
  'If both a total odometer and a trip meter are visible at the same time, read the total odometer.',
  'Step 2: transcribe the digits exactly as shown into "digits_seen", character by character, separated by single spaces, e.g. "1 0 2 7 . 3".',
  'Write "?" for any digit you cannot read with certainty, and never invent or complete digits. Keep a decimal point if the display shows one (trip meters usually have one decimal digit). Use null if no distance display is visible at all.',
  'Step 3: "display_mode" is "odo" if the number is the total odometer, "trip" if a TRIP indicator is shown, "unknown" if you cannot tell, or null if digits_seen is null.',
  'Step 4: find the fuel gauge. It can be a needle between E and F, OR a row of bars/segments on the LCD between E and F.',
  'Report "fuel_fraction" between 0 (empty, needle on E or no bars lit) and 1 (full, needle on F or all bars lit): for a needle, its position along the E-F arc; for bars, lit bars divided by total bars.',
  'Look closely at the needle tip or at each bar before answering. Use null only if no fuel gauge is visible at all.',
  'Return "confidence": between 0 and 1, how sure you are that the values you returned are correct. Use null if both digits_seen and fuel_fraction are null.',
  'Return "note": one short sentence (max 100 characters, English) only when something is null or uncertain, saying why (e.g. "digits are blurred by glare"); otherwise null.',
  'Reply only with JSON that matches the schema.',
].join('\n')

// Bidang bukti (digits_seen, fuel_fraction) diisi lebih dulu supaya model menuliskan apa yang ia lihat sebelum menyimpulkan.
const DASHBOARD_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['digits_seen', 'display_mode', 'fuel_fraction', 'confidence', 'note'],
  properties: {
    digits_seen: { type: ['string', 'null'] },
    display_mode: { type: ['string', 'null'], enum: [...DISPLAY_MODES, null] },
    fuel_fraction: { type: ['number', 'null'] },
    confidence: { type: ['number', 'null'] },
    note: { type: ['string', 'null'] },
  },
}

/**
 * km dari transkripsi digit: hanya bila SEMUA digit terbaca (tanpa "?"); desimal dibuang (km bulat). Tanpa transkripsi (jawaban gaya lama)
 * dipakai km apa adanya.
 */
const kmFromDigits = (raw) => {
  if (typeof raw.digits_seen !== 'string') return raw.digits_seen === null ? null : int(raw.km, { max: MAX_KM })
  const compact = raw.digits_seen.replace(/\s+/g, '')
  const m = compact.match(/^(\d{1,8})(?:[.,]\d{0,2})?$/)
  return m ? int(Number(m[1]), { max: MAX_KM }) : null
}

// Keyakinan hanya bermakna untuk nilai yang terbaca: bila km dan bahan bakar sama-sama null, keyakinan dikosongkan (model kadang menjawab
// "yakin" bahwa tidak ada yang terbaca, yang menyesatkan bila dibaca sebagai keyakinan atas hasil). Catatan alasan hanya dibawa bila ada.
const normalizeDashboard = (raw) => {
  const km = kmFromDigits(raw)
  // pecahan dari model (dibuat tingkat di sini); jawaban gaya lama membawa tingkatnya langsung
  const fuel = typeof raw.fuel_fraction === 'number' ? fuelLevelOf(raw.fuel_fraction) : (FUEL_LEVELS.includes(raw.fuel_level) ? raw.fuel_level : null) // eslint-disable-line no-nested-ternary
  const note = text(raw.note, 120)
  const digits = typeof raw.digits_seen === 'string' ? text(raw.digits_seen, 30) : null
  return {
    km,
    fuel_level: fuel,
    confidence: km === null && fuel === null ? null : confidence(raw.confidence),
    // Jenis layar hanya dibawa bila km terbaca (km boleh dari ODO maupun TRIP; admin melihat dari mana angkanya)
    ...(km !== null && DISPLAY_MODES.includes(raw.display_mode) ? { display_mode: raw.display_mode } : {}),
    ...(km !== null && digits ? { digits_seen: digits } : {}),
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
