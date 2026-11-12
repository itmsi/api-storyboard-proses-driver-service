const { addAudit, addUpdatedAtTrigger } = require('../helpers/audit')

// Serah terima barang + rekap keuangan DO (skema: schema.draft.sql bagian 7).
exports.up = async (knex) => {
  await knex.schema.createTable('handovers', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'))
    t.uuid('delivery_order_id').notNullable().unique().references('id')
      .inTable('delivery_orders')
    t.text('condition').notNullable() // lengkap | masalah | gagal_kirim
    t.decimal('received_quantity', 12, 2)
    t.text('failure_reason')
    t.text('note')
    t.text('receiver_name')
    t.uuid('signature_media_id').references('id').inTable('media')
    t.timestamp('signed_at', { useTz: true })
    t.boolean('acknowledges_issues')
    t.timestamp('recorded_at', { useTz: true }).notNullable() // waktu di HP
    t.decimal('lat', 9, 6)
    t.decimal('lng', 9, 6)
    t.decimal('gps_accuracy_m', 7, 2)
    t.uuid('client_ref').notNullable()
    addAudit(knex, t)
    t.unique(['created_by', 'client_ref'])
  })
  await knex.raw("ALTER TABLE handovers ADD CONSTRAINT handovers_condition_chk CHECK (condition IN ('lengkap', 'masalah', 'gagal_kirim'))")
  await knex.raw(`ALTER TABLE handovers ADD CONSTRAINT handovers_reason_chk CHECK (
    failure_reason IS NULL OR failure_reason IN ('penerima_tidak_ada', 'alamat_tidak_ditemukan', 'ditolak_penerima', 'lainnya'))`)
  await knex.raw("ALTER TABLE handovers ADD CONSTRAINT handovers_failed_chk CHECK (condition <> 'gagal_kirim' OR failure_reason IS NOT NULL)")
  await knex.raw(`ALTER TABLE handovers ADD CONSTRAINT handovers_receiver_chk CHECK (
    condition = 'gagal_kirim' OR (receiver_name IS NOT NULL AND signature_media_id IS NOT NULL))`)
  await addUpdatedAtTrigger(knex, 'handovers')

  await knex.schema.createTable('handover_issues', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'))
    t.uuid('handover_id').notNullable().references('id').inTable('handovers')
      .onDelete('CASCADE')
    t.text('type').notNullable()
    t.decimal('quantity', 12, 2).notNullable()
    t.text('unit').notNullable()
    t.text('note')
  })
  await knex.raw("ALTER TABLE handover_issues ADD CONSTRAINT handover_issues_type_chk CHECK (type IN ('rusak', 'kurang', 'salah_kirim', 'lainnya'))")
  await knex.raw('ALTER TABLE handover_issues ADD CONSTRAINT handover_issues_qty_chk CHECK (quantity > 0)')

  await knex.schema.createTable('handover_issue_photos', (t) => {
    t.uuid('issue_id').notNullable().references('id').inTable('handover_issues')
      .onDelete('CASCADE')
    t.uuid('media_id').notNullable().unique().references('id')
      .inTable('media')
    t.primary(['issue_id', 'media_id'])
  })

  // Rekap keuangan per DO, dibekukan saat DO diselesaikan
  await knex.schema.createTable('settlements', (t) => {
    t.uuid('delivery_order_id').primary().references('id').inTable('delivery_orders')
    t.bigInteger('travel_allowance').notNullable()
    t.bigInteger('expense_total').notNullable()
    t.text('type').notNullable() // refund_to_company | payable_to_driver | balanced
    t.bigInteger('amount').notNullable()
    t.decimal('distance_km', 8, 1)
    t.integer('duration_minutes')
    t.timestamp('settled_at', { useTz: true }) // diisi finance saat uang disetor / dibayar
    t.uuid('settled_by')
    t.text('note') // catatan saat ditandai sudah disetor/dibayar
    addAudit(knex, t)
  })
  await knex.raw("ALTER TABLE settlements ADD CONSTRAINT settlements_type_chk CHECK (type IN ('refund_to_company', 'payable_to_driver', 'balanced'))")
  await knex.raw('ALTER TABLE settlements ADD CONSTRAINT settlements_amount_chk CHECK (amount >= 0)')
  await addUpdatedAtTrigger(knex, 'settlements')
}

exports.down = async (knex) => {
  await knex.schema.dropTableIfExists('settlements')
  await knex.schema.dropTableIfExists('handover_issue_photos')
  await knex.schema.dropTableIfExists('handover_issues')
  await knex.schema.dropTableIfExists('handovers')
}
