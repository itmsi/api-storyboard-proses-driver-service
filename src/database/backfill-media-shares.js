/**
 * Buat link share publik Nextcloud untuk foto yang belum punya (foto lama, atau share yang gagal dibuat saat upload).
 *
 *   npm run backfill:media-shares -- --client=OGO
 *   npm run backfill:media-shares -- --all
 *
 * Aman diulang: hanya foto yang url/thumb_url-nya masih kosong yang diproses. Hanya STORAGE_DRIVER=nextcloud.
 */
const config = require('../config')
const storage = require('../utils/storage')
const tenant = require('./tenant')

const args = process.argv.slice(2)
const flag = (name) => args.includes(`--${name}`)
const option = (name) => (args.find((a) => a.startsWith(`--${name}=`)) || '').split('=')[1]

const run = async (code) => {
  const db = await tenant.getDb(code, { allowInactive: true })
  const rows = await db('media')
    .where((q) => q.whereNull('url').orWhere((t) => t.whereNotNull('thumb_key').whereNull('thumb_url')))
    .select('id', 'storage_key', 'thumb_key', 'url', 'thumb_url')
  let done = 0
  let failed = 0
  // eslint-disable-next-line no-restricted-syntax
  for (const row of rows) { // berurutan agar Nextcloud tidak dibanjiri
    // eslint-disable-next-line no-await-in-loop
    const shareUrl = row.url || await storage.createShare(row.storage_key)
    // eslint-disable-next-line no-await-in-loop
    const thumbUrl = row.thumb_key ? (row.thumb_url || await storage.createShare(row.thumb_key)) : null
    if (shareUrl && (!row.thumb_key || thumbUrl)) {
      // eslint-disable-next-line no-await-in-loop
      await db('media').where({ id: row.id }).update({ url: shareUrl, thumb_url: thumbUrl })
      done += 1
    } else {
      failed += 1
    }
  }
  console.log(`[${code}] ${rows.length} foto diperiksa: ${done} dibuatkan link share, ${failed} gagal (jalankan lagi untuk mengulang)`)
  return failed
};
(async () => {
  if (config.storage.driver !== 'nextcloud') throw new Error('Hanya untuk STORAGE_DRIVER=nextcloud')
  let codes
  if (flag('all')) codes = await tenant.listCodes()
  else if (option('client')) codes = [option('client')]
  else throw new Error('Gunakan --client=KODE atau --all')

  let failed = 0
  // eslint-disable-next-line no-restricted-syntax
  for (const code of codes) {
    try {
      // eslint-disable-next-line no-await-in-loop
      failed += await run(code)
    } catch (err) {
      failed += 1
      console.error(`[${code}] GAGAL: ${err.message}`)
    }
  }
  await tenant.closeAll()
  process.exit(failed ? 1 : 0)
})().catch((err) => {
  console.error(err.message)
  process.exit(1)
})
