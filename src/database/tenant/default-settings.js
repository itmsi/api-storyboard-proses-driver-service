/**
 * Seeder pengaturan bawaan per client (idempoten), dijalankan setelah migrasi tenant (CLI dan endpoint internal) dan
 * saat seed tenant. Hanya MENAMBAH baris app_settings yang belum ada: pengaturan yang sudah diubah admin tidak disentuh.
 *
 *  - document_prefix: teks di depan nomor DO, dari client_code (seperti nama database client), mis. OGO -> "OGO-" (OGO-0145).
 */

// Karakter yang diterima PUT /settings untuk document_prefix (lihat modules/settings/validation.js), maks. 20
const PREFIX_MAX = 20
const FALLBACK_PREFIX = 'DO-'

/** "ogo" -> "OGO-", "pt maju" -> "PTMAJU-". Kode kosong / tidak valid -> "DO-". */
const documentPrefixFor = (clientCode) => {
  const code = String(clientCode || '').trim().toUpperCase().replace(/[^A-Z0-9._-]/g, '')
  if (!code) return FALLBACK_PREFIX
  return `${code.slice(0, PREFIX_MAX - 1)}-`
}

/** Nilai bawaan per client yang ditanam ke app_settings bila kuncinya belum ada. */
const defaultsFor = (clientCode) => ({
  document_prefix: documentPrefixFor(clientCode),
})

/**
 * @returns {Promise<{ created: string[], kept: string[] }>}  kunci yang baru dibuat / yang sudah ada (dibiarkan)
 */
const ensureDefaultSettings = async (db, clientCode) => {
  const created = []
  const kept = []
  // eslint-disable-next-line no-restricted-syntax
  for (const [key, value] of Object.entries(defaultsFor(clientCode))) {
    // eslint-disable-next-line no-await-in-loop
    const rows = await db('app_settings')
      .insert({ key, value: JSON.stringify(value) })
      .onConflict('key')
      .ignore()
      .returning('key')
    if (rows.length) created.push(key)
    else kept.push(key)
  }
  return { created, kept }
}

module.exports = { ensureDefaultSettings, documentPrefixFor, defaultsFor }
