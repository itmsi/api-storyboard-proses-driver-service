/**
 * Penanda "perlu dilihat" (needs_review) untuk bacaan odometer dan struk BBM, beserta alasannya (review_reasons).
 * Fungsi murni tanpa database. Hasil AI hanya pembanding: penanda ini tidak mengubah nilai efektif (effective_*).
 *
 * Alasan:
 *   dikoreksi_driver       driver mengoreksi hasil OCR FE
 *   fe_ai_berbeda          OCR FE dan hasil AI berbeda (pada nilai yang sama-sama terbaca)
 *   koreksi_beda_ai        koreksi driver berbeda dari hasil AI
 *   keyakinan_ai_rendah    keyakinan AI di bawah LOW_CONFIDENCE
 *   ai_tidak_terbaca       AI selesai tetapi tidak bisa membaca nilai apa pun dari foto
 *   km_mundur              (odometer) angka lebih kecil dari odometer terakhir yang tercatat untuk unit; hanya bisa dinilai saat dicatat
 *   total_tidak_cocok      (struk) liter x harga per liter tidak cocok dengan total
 *   jam_struk_di_luar_do   (struk) jam struk di luar rentang perjalanan DO
 */
const LOW_CONFIDENCE = 0.6

// Alasan yang diturunkan dari hasil AI: dihitung ulang setiap hasil AI masuk. Alasan lain dipertahankan dari saat bacaan dicatat.
const AI_REASONS = ['fe_ai_berbeda', 'koreksi_beda_ai', 'keyakinan_ai_rendah', 'ai_tidak_terbaca']

const isSet = (v) => v !== null && v !== undefined

/** Dua nilai dianggap berbeda hanya bila keduanya terbaca dan tidak sama. */
const differs = (a, b) => {
  if (!isSet(a) || !isSet(b)) return false
  if (typeof a === 'number' && typeof b === 'number') return Math.abs(a - b) > 0.0051 // liter dibulatkan 2 desimal
  return String(a).trim().toLowerCase() !== String(b).trim().toLowerCase()
}

const unique = (list) => [...new Set(list)]
const result = (reasons) => ({ needs_review: reasons.length > 0, review_reasons: reasons })
const kept = (keep) => (keep || []).filter((r) => !AI_REASONS.includes(r))

/**
 * @param {object} row  bacaan odometer: ocr_km, ocr_fuel_level, corrected_km, corrected_fuel_level, effective_km
 * @param {{ km: number|null, fuel_level: string|null, confidence: number|null }|null} ai  hasil AI yang selesai; null = belum ada
 * @param {object} [options]
 * @param {number|null} [options.previousUnitKm]  odometer terakhir unit sebelum bacaan ini (hanya saat dicatat)
 * @param {string[]} [options.keep]               alasan yang tersimpan sebelumnya (alasan non-AI dipertahankan)
 */
const odometer = (row, ai, { previousUnitKm = null, keep = [] } = {}) => {
  const reasons = kept(keep).filter((r) => r !== 'dikoreksi_driver')
  if (isSet(previousUnitKm) && isSet(row.effective_km) && row.effective_km < previousUnitKm) reasons.push('km_mundur')
  if (isSet(row.corrected_km) || isSet(row.corrected_fuel_level)) reasons.push('dikoreksi_driver')

  if (ai) {
    if (!isSet(ai.km) && !isSet(ai.fuel_level)) {
      reasons.push('ai_tidak_terbaca')
    } else {
      if (differs(row.ocr_km, ai.km) || differs(row.ocr_fuel_level, ai.fuel_level)) reasons.push('fe_ai_berbeda')
      if (differs(row.corrected_km, ai.km) || differs(row.corrected_fuel_level, ai.fuel_level)) reasons.push('koreksi_beda_ai')
    }
    if (isSet(ai.confidence) && ai.confidence < LOW_CONFIDENCE) reasons.push('keyakinan_ai_rendah')
  }
  return result(unique(reasons))
}

const RECEIPT_COMPARED = ['total', 'liters', 'price_per_liter', 'time', 'fuel_type']

const receiptDiffers = (a, b) => Boolean(a) && Boolean(b) && RECEIPT_COMPARED.some((k) => differs(a[k], b[k]))

/**
 * @param {object} row  biaya: ocr_fields, corrected_fields, checks (jsonb)
 * @param {object|null} ai  hasil AI struk yang selesai (total, liters, price_per_liter, time, fuel_type, confidence); null = belum ada
 */
const expense = (row, ai) => {
  const reasons = []
  if (row.corrected_fields) reasons.push('dikoreksi_driver')
  if (row.checks && row.checks.liters_x_price_matches_total === false) reasons.push('total_tidak_cocok')
  if (row.checks && row.checks.receipt_time_within_do === false) reasons.push('jam_struk_di_luar_do')

  if (ai) {
    if (RECEIPT_COMPARED.every((k) => !isSet(ai[k]))) {
      reasons.push('ai_tidak_terbaca')
    } else {
      if (receiptDiffers(row.ocr_fields, ai)) reasons.push('fe_ai_berbeda')
      if (receiptDiffers(row.corrected_fields, ai)) reasons.push('koreksi_beda_ai')
    }
    if (isSet(ai.confidence) && ai.confidence < LOW_CONFIDENCE) reasons.push('keyakinan_ai_rendah')
  }
  return result(unique(reasons))
}

module.exports = {
  odometer, expense, LOW_CONFIDENCE, AI_REASONS, differs,
}
