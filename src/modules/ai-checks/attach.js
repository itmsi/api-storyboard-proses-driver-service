const logger = require('../../utils/logger')
const review = require('./review')
const repo = require('./repository')

/**
 * Menempelkan hasil pengecekan AI ke bacaan odometer / biaya (docs/PLAN-OCR.md langkah 6), dua arah:
 *   - hasil AI selesai belakangan, setelah bacaan disimpan  -> onCheckDone (dipanggil worker)
 *   - hasil AI sudah ada saat bacaan disimpan                -> attachAfterCreate (dipanggil SETELAH transaksi pembuatan commit)
 * Kedua arah dijalankan setelah commit di sisinya masing-masing, jadi salah satunya pasti melihat pasangannya (tidak ada celah balapan).
 *
 * Hasil AI hanya pembanding: yang ditulis hanya ai_* dan penanda needs_review; ocr_*, corrected_*, dan effective_* tidak disentuh.
 */

const odometerAi = (check) => (check && check.status === 'done' && check.result ? {
  km: check.result.km ?? null, fuel_level: check.result.fuel_level ?? null, confidence: check.result.confidence ?? null,
} : null)

/** Kolom ai_* yang ditulis: hasil AI bila sudah selesai; selain itu hanya tautan ke pengecekannya (yang masih antre). */
const odometerAiColumns = (check, ai) => {
  if (ai) {
    return {
      ai_km: ai.km, ai_fuel_level: ai.fuel_level, ai_confidence: ai.confidence, ai_check_id: check.id
    }
  }
  return check ? { ai_check_id: check.id } : {}
}

const applyToOdometer = async (db, reading, check) => {
  const ai = odometerAi(check)
  const flags = review.odometer(reading, ai, { keep: reading.review_reasons })
  await db('odometer_readings').where({ id: reading.id }).update({
    ...odometerAiColumns(check, ai),
    needs_review: flags.needs_review,
    review_reasons: flags.review_reasons,
  })
}

const expenseAi = (check) => (check && check.status === 'done' && check.result ? check.result : null)

const expenseAiColumns = (check, ai) => {
  if (ai) return { ai_fields: JSON.stringify(ai), ai_confidence: ai.confidence ?? null, ai_check_id: check.id }
  return check ? { ai_check_id: check.id } : {}
}

const applyToExpense = async (db, expense, check) => {
  const ai = expenseAi(check)
  const flags = review.expense(expense, ai)
  await db('expenses').where({ id: expense.id }).update({
    ...expenseAiColumns(check, ai),
    needs_review: flags.needs_review,
    review_reasons: flags.review_reasons,
  })
}

/** Hanya struk BBM (kategori receipt_ocr) yang dibandingkan dengan hasil AI struk; struk tol/parkir tidak. */
const findReceiptExpenses = (db, mediaId) => db('expenses')
  .join('expense_categories', 'expense_categories.code', 'expenses.category_code')
  .where({ 'expenses.proof_media_id': mediaId, 'expense_categories.input': 'receipt_ocr' })
  .select('expenses.*')

/** Worker: hasil AI baru tersimpan; tempelkan ke bacaan yang memakai foto itu (bila sudah ada). */
const onCheckDone = async (db, check) => {
  if (check.kind === 'dashboard') {
    const readings = await db('odometer_readings').where({ media_id: check.media_id })
    // eslint-disable-next-line no-restricted-syntax
    for (const reading of readings) await applyToOdometer(db, reading, check) // eslint-disable-line no-await-in-loop
  } else if (check.kind === 'receipt') {
    const expenses = await findReceiptExpenses(db, check.media_id)
    // eslint-disable-next-line no-restricted-syntax
    for (const expense of expenses) await applyToExpense(db, expense, check) // eslint-disable-line no-await-in-loop
  }
}

/**
 * Setelah bacaan baru dicatat dan transaksinya commit: bila foto itu sudah pernah diminta pengecekannya, tempelkan (yang sudah selesai
 * mengisi ai_*; yang masih antre hanya ditautkan, lalu worker mengisinya saat selesai). Kegagalan di sini tidak boleh menggagalkan
 * pencatatan driver: AI bersifat opsional.
 *
 * @param {'odometer'|'expense'} type
 * @param {string} id  id bacaan/biaya
 */
const attachAfterCreate = async (db, type, id) => {
  try {
    if (type === 'odometer') {
      const reading = await db('odometer_readings').where({ id }).first()
      const check = reading && await repo.findByMedia(db, reading.media_id)
      if (check) await applyToOdometer(db, reading, check)
    } else {
      const [expense] = await db('expenses').where({ id }).limit(1)
      const [receipt] = expense && expense.proof_media_id ? await findReceiptExpenses(db, expense.proof_media_id) : []
      const check = receipt && await repo.findByMedia(db, receipt.proof_media_id)
      if (check) await applyToExpense(db, receipt, check)
    }
  } catch (err) {
    logger.error(`Gagal menempelkan hasil AI ke ${type} ${id}: ${err.message}`)
  }
}

module.exports = { onCheckDone, attachAfterCreate }
