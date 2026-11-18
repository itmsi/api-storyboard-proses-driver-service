const Joi = require('joi')

/**
 * Filter masa berlaku dokumen (STNK, KIR, SIM) untuk daftar admin.
 *   expired  : sudah lewat (tanggal < hari ini)
 *   expiring : akan habis dalam `expiring_days` hari ke depan (hari ini sampai batas, termasuk hari batas)
 *   valid    : masih berlaku lebih lama dari batas itu
 *   unknown  : tanggal belum diisi
 * Tanggal dibandingkan sebagai tanggal kalender WIB (kolom bertipe date).
 */
const EXPIRY_STATUSES = ['expired', 'expiring', 'valid', 'unknown']
const DEFAULT_EXPIRING_DAYS = 30

const expiryStatus = Joi.string().valid(...EXPIRY_STATUSES)
const expiringDays = Joi.number().integer().min(1).max(365)
  .default(DEFAULT_EXPIRING_DAYS)

/** Tanggal 'YYYY-MM-DD' yang berjarak `days` hari dari tanggal `date` (YYYY-MM-DD). */
const addDays = (date, days) => {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/** Tambahkan syarat ke query knex untuk kolom bertipe date. today/soon = YYYY-MM-DD. */
const applyExpiry = (q, column, status, { today, soon }) => {
  if (status === 'expired') q.where(column, '<', today)
  else if (status === 'expiring') q.where(column, '>=', today).where(column, '<=', soon)
  else if (status === 'valid') q.where(column, '>', soon)
  else if (status === 'unknown') q.whereNull(column)
  return q
}

module.exports = {
  EXPIRY_STATUSES, expiryStatus, expiringDays, addDays, applyExpiry,
}
