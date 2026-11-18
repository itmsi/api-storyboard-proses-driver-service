// Link share publik Nextcloud untuk foto . Dibuat saat upload; foto lama diisi lewat npm run backfill:media-shares.
// Kosong = belum punya link share, url foto jatuh ke /storage (proxy API).
exports.up = (knex) => knex.schema.alterTable('media', (t) => {
  t.text('url')
  t.text('thumb_url')
})

exports.down = (knex) => knex.schema.alterTable('media', (t) => {
  t.dropColumn('url')
  t.dropColumn('thumb_url')
})
