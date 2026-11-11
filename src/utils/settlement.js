/**
 * Selisih uang jalan dan total biaya DO (dipakai ringkasan driver, penyelesaian DO, dan pembatalan biaya oleh admin):
 * positif = sisa disetor ke perusahaan, negatif = kurang bayar ke driver, nol = pas.
 */
const settle = (allowance, total) => {
  const diff = allowance - total
  if (diff > 0) return { type: 'refund_to_company', amount: diff, label: 'Sisa disetor' }
  if (diff < 0) return { type: 'payable_to_driver', amount: -diff, label: 'Kurang bayar ke driver' }
  return { type: 'balanced', amount: 0, label: 'Pas, tidak ada selisih' }
}

const LABELS = {
  refund_to_company: 'Sisa disetor',
  payable_to_driver: 'Kurang bayar ke driver',
  balanced: 'Pas, tidak ada selisih',
}

module.exports = { settle, LABELS }
