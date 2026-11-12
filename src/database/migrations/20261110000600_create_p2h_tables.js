const { addAudit, addUpdatedAtTrigger } = require('../helpers/audit')

// P2H = pemeriksaan harian unit (skema: schema.draft.sql bagian 5), satu P2H aktif per unit per hari.
exports.up = async (knex) => {
  await knex.schema.createTable('p2h_check_items', (t) => {
    t.text('code').primary() // ban, oli, lampu, rem
    t.text('label').notNullable()
    t.text('hint')
    t.boolean('is_critical').notNullable().defaultTo(false) // tidak_sesuai pada item kritis -> tidak_layak
    t.integer('sort_order').notNullable().defaultTo(0)
    t.boolean('is_active').notNullable().defaultTo(true)
    addAudit(knex, t, { softDelete: true })
  })
  await addUpdatedAtTrigger(knex, 'p2h_check_items')

  // Checklist bawaan (data acuan, bukan data dev): admin bisa mengubahnya per client
  await knex('p2h_check_items').insert([
    {
      code: 'ban', label: 'Ban', hint: 'Tekanan dan kondisi tapak', is_critical: false, sort_order: 1
    },
    {
      code: 'oli', label: 'Oli', hint: 'Level mesin dan rembesan', is_critical: false, sort_order: 2
    },
    {
      code: 'lampu', label: 'Lampu', hint: 'Utama, sein, rem, mundur', is_critical: false, sort_order: 3
    },
    {
      code: 'rem', label: 'Rem', hint: 'Rem kaki dan tangan', is_critical: true, sort_order: 4
    },
  ])

  await knex.schema.createTable('p2h_inspections', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'))
    t.uuid('unit_id').notNullable().references('id').inTable('units')
    t.date('inspection_date').notNullable() // tanggal lokal Asia/Jakarta
    t.text('status').notNullable()
    t.boolean('can_operate').notNullable()
    t.uuid('checked_by').notNullable().references('id').inTable('drivers')
    t.timestamp('checked_at', { useTz: true }).notNullable()
    t.decimal('lat', 9, 6)
    t.decimal('lng', 9, 6)
    t.decimal('gps_accuracy_m', 7, 2)
    t.boolean('admin_confirmed_by_driver')
    t.timestamp('valid_until', { useTz: true }).notNullable()
    // P2H ulang diminta admin: baris lama ditandai superseded, driver membuat baris baru
    t.timestamp('superseded_at', { useTz: true })
    t.uuid('recheck_requested_by').references('id').inTable('users')
    t.timestamp('recheck_requested_at', { useTz: true })
    t.text('recheck_note')
    t.uuid('client_ref').notNullable() // idempotensi kirim ulang dari HP
    addAudit(knex, t, { softDelete: true })
    t.unique(['checked_by', 'client_ref'])
  })
  await knex.raw("ALTER TABLE p2h_inspections ADD CONSTRAINT p2h_status_chk CHECK (status IN ('layak', 'catatan', 'tidak_layak'))")
  await knex.raw('CREATE UNIQUE INDEX p2h_current_uq ON p2h_inspections (unit_id, inspection_date) WHERE superseded_at IS NULL AND is_delete = false')
  await addUpdatedAtTrigger(knex, 'p2h_inspections')

  await knex.schema.createTable('p2h_inspection_items', (t) => {
    t.uuid('inspection_id').notNullable().references('id').inTable('p2h_inspections')
      .onDelete('CASCADE')
    t.text('item_code').notNullable().references('code').inTable('p2h_check_items')
    t.text('label').notNullable() // snapshot label saat diperiksa
    t.text('result').notNullable()
    t.text('description')
    t.primary(['inspection_id', 'item_code'])
  })
  await knex.raw("ALTER TABLE p2h_inspection_items ADD CONSTRAINT p2h_item_result_chk CHECK (result IN ('sesuai', 'tidak_sesuai'))")
  await knex.raw("ALTER TABLE p2h_inspection_items ADD CONSTRAINT p2h_item_desc_chk CHECK (result = 'sesuai' OR description IS NOT NULL)")

  await knex.schema.createTable('p2h_inspection_photos', (t) => {
    t.uuid('inspection_id').notNullable().references('id').inTable('p2h_inspections')
      .onDelete('CASCADE')
    t.text('side').notNullable()
    t.uuid('media_id').notNullable().references('id').inTable('media')
    t.primary(['inspection_id', 'side'])
  })
  await knex.raw("ALTER TABLE p2h_inspection_photos ADD CONSTRAINT p2h_photo_side_chk CHECK (side IN ('depan', 'kanan', 'kiri', 'belakang'))")
}

exports.down = async (knex) => {
  await knex.schema.dropTableIfExists('p2h_inspection_photos')
  await knex.schema.dropTableIfExists('p2h_inspection_items')
  await knex.schema.dropTableIfExists('p2h_inspections')
  await knex.schema.dropTableIfExists('p2h_check_items')
}
