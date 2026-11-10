/**
 * Format waktu kontrak: ISO 8601 dengan offset WIB, contoh 2026-11-05T13:50:00+07:00.
 * (Asia/Jakarta tidak memakai DST, jadi offset tetap +07:00.)
 */
const WIB_OFFSET_MS = 7 * 60 * 60 * 1000

const toWib = (value) => {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return `${new Date(date.getTime() + WIB_OFFSET_MS).toISOString().slice(0, 19)}+07:00`
}

/** Tanggal lokal WIB (YYYY-MM-DD) dari sebuah waktu; default = sekarang. */
const wibDate = (value = new Date()) => toWib(value).slice(0, 10)

/** Waktu akhir hari WIB untuk tanggal YYYY-MM-DD dan jam "HH:mm" (default 23:59). */
const endOfWibDay = (date, hhmm = '23:59') => new Date(`${date}T${hhmm}:00+07:00`)

module.exports = { toWib, wibDate, endOfWibDay }
