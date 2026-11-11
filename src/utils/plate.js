/**
 * Plat nomor Indonesia -> bentuk baku "B 9123 KZ" (huruf besar, satu spasi antar bagian).
 *   "b9123kz" / "B  9123  KZ" / "B-9123-KZ"  ->  "B 9123 KZ"
 * Mengembalikan null jika bukan plat yang masuk akal (1-2 huruf, 1-4 angka, 0-3 huruf).
 */
const normalizePlate = (input) => {
  const cleaned = String(input || '').toUpperCase().replace(/[\s-]+/g, '')
  const match = /^([A-Z]{1,2})(\d{1,4})([A-Z]{0,3})$/.exec(cleaned)
  if (!match) return null
  return [match[1], match[2], match[3]].filter(Boolean).join(' ')
}

module.exports = { normalizePlate }
