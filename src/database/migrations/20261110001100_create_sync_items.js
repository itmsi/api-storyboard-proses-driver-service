const { addAudit, addUpdatedAtTrigger } = require('../helpers/audit')

// Catatan sinkronisasi offline: setiap item yang dikirim lewat POST /sync/batch dicatat hasilnya.
// Dipakai untuk pending_sync (item gagal yang belum berhasil dikirim ulang), audit, dan last_synced_at per perangkat.
exports.up = async (knex) => {
  await knex.schema.alterTable('devices', (t) => {
    t.timestamp('last_synced_at', { useTz: true })
  })

  await knex.schema.createTable('sync_items', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'))
    t.text('device_id') // devices.device_id (teks dari HP)
    t.uuid('client_ref').notNullable()
    t.text('method').notNullable()
    t.text('path').notNullable()
    t.uuid('delivery_order_id') // jika path menyangkut DO
    t.text('type').notNullable() // expense | loading | odometer | handover | accept | complete | p2h | settings
    t.text('label') // teks singkat untuk layar Berjalan, mis. "Tol 54.500"
    t.text('status').notNullable() // created | failed
    t.jsonb('error') // isi error terakhir jika failed
    t.text('result_id') // id resource yang dibuat
    t.timestamp('client_created_at', { useTz: true }).notNullable()
    t.timestamp('processed_at', { useTz: true }).notNullable().defaultTo(knex.fn.now())
    t.integer('attempts').notNullable().defaultTo(1)
    addAudit(knex, t)
    t.unique(['created_by', 'client_ref'])
  })
  await knex.raw("ALTER TABLE sync_items ADD CONSTRAINT sync_items_status_chk CHECK (status IN ('created', 'failed'))")
  await knex.raw("CREATE INDEX sync_items_failed_idx ON sync_items (created_by, client_created_at) WHERE status = 'failed'")
  await addUpdatedAtTrigger(knex, 'sync_items')
}

exports.down = async (knex) => {
  await knex.schema.dropTableIfExists('sync_items')
  await knex.schema.alterTable('devices', (t) => {
    t.dropColumn('last_synced_at')
  })
}
