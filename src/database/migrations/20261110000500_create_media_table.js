const { addAudit, addUpdatedAtTrigger } = require('../helpers/audit')

// Semua foto dari kamera aplikasi (skema: schema.draft.sql bagian 4)
const KINDS = [
  'odometer_start', 'odometer_end', 'receipt', 'loading', 'delivery_note',
  'unloading', 'stamped_delivery_note', 'p2h_body', 'damage', 'location', 'signature',
]

exports.up = async (knex) => {
  await knex.schema.createTable('media', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'))
    t.text('kind').notNullable()
    t.text('side') // depan | kanan | kiri | belakang (hanya kind p2h_body)
    t.text('storage_key').notNullable() // media/OGO/2026/11/05/<uuid>.jpg
    t.text('thumb_key')
    t.text('mime_type').notNullable()
    t.integer('size_bytes').notNullable()
    t.text('sha256').notNullable() // deteksi foto dipakai ulang
    t.text('source').notNullable().defaultTo('camera')
    t.timestamp('captured_at', { useTz: true }).notNullable() // waktu di HP
    t.timestamp('server_received_at', { useTz: true }).notNullable().defaultTo(knex.fn.now())
    t.decimal('lat', 9, 6)
    t.decimal('lng', 9, 6)
    t.decimal('gps_accuracy_m', 7, 2)
    t.uuid('captured_by').notNullable().references('id').inTable('users')
    t.uuid('client_ref').notNullable() // idempotensi upload ulang
    addAudit(knex, t, { softDelete: true })
    t.unique(['captured_by', 'client_ref'])
  })
  await knex.raw(`ALTER TABLE media ADD CONSTRAINT media_kind_chk CHECK (kind IN (${KINDS.map((k) => `'${k}'`).join(', ')}))`)
  await knex.raw("ALTER TABLE media ADD CONSTRAINT media_side_chk CHECK (side IS NULL OR side IN ('depan', 'kanan', 'kiri', 'belakang'))")
  await knex.raw("ALTER TABLE media ADD CONSTRAINT media_source_chk CHECK (source IN ('camera'))")
  await knex.raw('CREATE INDEX media_sha256_idx ON media (sha256)')
  await addUpdatedAtTrigger(knex, 'media')
}

exports.down = (knex) => knex.schema.dropTableIfExists('media')
