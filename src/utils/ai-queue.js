const logger = require('./logger')

/**
 * Antrean pekerjaan pengecekan AI. Modul ini hanya MENERBITKAN pesan; pengirimnya (RabbitMQ) dipasang saat server hidup lewat
 * setPublisher() (docs/PLAN-OCR.md langkah 5), dan test memasang penampung di memori.
 *
 * Pesan: { client_code, ai_check_id }. Worker memilih database client dari client_code lalu memproses baris ai_checks itu.
 * Pesan yang gagal terkirim (broker mati, belum ada pengirim) TIDAK membuat permintaan gagal: barisnya tetap berstatus `queued`
 * di database, dan worker menyapu baris `queued`/`processing` yang menggantung (indeks ai_checks_pending_idx).
 */
let publisher = null

const setPublisher = (fn) => { publisher = fn }

/** @returns {Promise<boolean>} true bila pesan diterbitkan; false bila tidak (dicatat di log). */
const publish = async (message) => {
  if (!publisher) {
    logger.warn(`Antrean pengecekan AI belum terpasang; ${message.ai_check_id} menunggu disapu worker`)
    return false
  }
  try {
    await publisher(message)
    return true
  } catch (err) {
    logger.error(`Gagal menerbitkan pengecekan AI ${message.ai_check_id}: ${err.message}`)
    return false
  }
}

module.exports = { setPublisher, publish }
