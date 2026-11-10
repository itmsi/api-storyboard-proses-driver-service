/**
 * Normalisasi nomor HP Indonesia ke E.164 (+62...). Mengembalikan null jika bukan nomor HP
 * (mis. "DRV-0021"), sehingga input login bisa dibedakan: nomor HP atau ID driver.
 *
 *   0812-3456-7890 / 0812 3456 7890 / 6281234567890 / +6281234567890  ->  +6281234567890
 */
const normalizePhone = (input) => {
  const raw = String(input || '').trim()
  if (!/^\+?[0-9][0-9\s().-]{5,}$/.test(raw)) return null

  const digits = raw.replace(/\D/g, '')
  let national
  if (digits.startsWith('62')) national = digits.slice(2)
  else if (digits.startsWith('0')) national = digits.slice(1)
  else national = digits

  if (national.length < 8 || national.length > 13) return null
  return `+62${national}`
}

module.exports = { normalizePhone }
