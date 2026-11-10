const { addAudit, addUpdatedAtTrigger } = require('../helpers/audit')

// Langkah perjalanan: muat, odometer, biaya (skema: schema.draft.sql bagian 3 & 7).
// created_by selalu diisi; unique (created_by, client_ref) membuat kirim ulang dari HP idempoten.
exports.up = async (knex) => {
  await knex.schema.createTable('expense_categories', (t) => {
    t.text('code').primary() // bbm, tol, parkir, lainnya
    t.text('label').notNullable()
    t.text('input').notNullable() // receipt_ocr | manual
    t.boolean('description_required').notNullable().defaultTo(false)
    t.boolean('proof_required').notNullable().defaultTo(false)
    t.integer('sort_order').notNullable().defaultTo(0)
    t.boolean('is_active').notNullable().defaultTo(true)
    addAudit(knex, t)
  })
  await knex.raw("ALTER TABLE expense_categories ADD CONSTRAINT expense_categories_input_chk CHECK (input IN ('receipt_ocr', 'manual'))")
  await addUpdatedAtTrigger(knex, 'expense_categories')
  // Data acuan bawaan (bisa diubah admin per client)
  await knex('expense_categories').insert([
    {
      code: 'bbm', label: 'BBM', input: 'receipt_ocr', proof_required: true, sort_order: 1,
    },
    {
      code: 'tol', label: 'Tol', input: 'manual', sort_order: 2,
    },
    {
      code: 'parkir', label: 'Parkir', input: 'manual', sort_order: 3,
    },
    {
      code: 'lainnya', label: 'Lainnya', input: 'manual', description_required: true, sort_order: 4,
    },
  ])

  // Foto yang menempel ke DO. media_id unik: satu foto hanya boleh dipakai sekali.
  await knex.schema.createTable('delivery_order_media', (t) => {
    t.uuid('delivery_order_id').notNullable().references('id').inTable('delivery_orders')
    t.uuid('media_id').notNullable().unique().references('id')
      .inTable('media')
    t.text('purpose').notNullable()
    t.smallint('page_no') // halaman surat jalan
    t.smallint('sort_order').notNullable().defaultTo(0)
    t.primary(['delivery_order_id', 'media_id'])
  })
  await knex.raw(`ALTER TABLE delivery_order_media ADD CONSTRAINT do_media_purpose_chk CHECK (purpose IN (
    'loading', 'delivery_note', 'unloading', 'stamped_delivery_note', 'signature', 'location'))`)

  await knex.schema.createTable('loadings', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'))
    t.uuid('delivery_order_id').notNullable().unique().references('id')
      .inTable('delivery_orders')
    t.timestamp('loaded_at', { useTz: true }).notNullable()
    t.decimal('lat', 9, 6)
    t.decimal('lng', 9, 6)
    t.decimal('gps_accuracy_m', 7, 2)
    t.boolean('quantity_matches_do').notNullable()
    t.text('quantity_note')
    t.integer('photo_count').notNullable()
    t.uuid('client_ref').notNullable()
    addAudit(knex, t)
    t.unique(['created_by', 'client_ref'])
  })
  await knex.raw('ALTER TABLE loadings ADD CONSTRAINT loadings_note_chk CHECK (quantity_matches_do OR quantity_note IS NOT NULL)')
  await addUpdatedAtTrigger(knex, 'loadings')

  await knex.schema.createTable('odometer_readings', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'))
    t.uuid('delivery_order_id').notNullable().references('id').inTable('delivery_orders')
    t.text('type').notNullable() // start | end
    t.uuid('media_id').notNullable().unique().references('id')
      .inTable('media')
    t.integer('ocr_km')
    t.text('ocr_fuel_level')
    t.integer('corrected_km')
    t.text('corrected_fuel_level')
    t.text('correction_reason')
    t.integer('effective_km').notNullable() // koreksi jika ada, selain itu OCR
    t.text('effective_fuel_level')
    t.text('effective_source').notNullable() // ocr | corrected
    t.timestamp('captured_at', { useTz: true }).notNullable()
    t.decimal('lat', 9, 6)
    t.decimal('lng', 9, 6)
    t.decimal('gps_accuracy_m', 7, 2)
    t.uuid('client_ref').notNullable()
    addAudit(knex, t)
    t.unique(['delivery_order_id', 'type'])
    t.unique(['created_by', 'client_ref'])
  })
  const levels = "('empty', 'quarter', 'half', 'three_quarter', 'full')"
  await knex.raw("ALTER TABLE odometer_readings ADD CONSTRAINT odo_type_chk CHECK (type IN ('start', 'end'))")
  await knex.raw(`ALTER TABLE odometer_readings ADD CONSTRAINT odo_ocr_fuel_chk CHECK (ocr_fuel_level IS NULL OR ocr_fuel_level IN ${levels})`)
  await knex.raw(`ALTER TABLE odometer_readings ADD CONSTRAINT odo_corr_fuel_chk CHECK (corrected_fuel_level IS NULL OR corrected_fuel_level IN ${levels})`)
  await knex.raw(`ALTER TABLE odometer_readings ADD CONSTRAINT odo_eff_fuel_chk CHECK (effective_fuel_level IS NULL OR effective_fuel_level IN ${levels})`)
  await knex.raw("ALTER TABLE odometer_readings ADD CONSTRAINT odo_source_chk CHECK (effective_source IN ('ocr', 'corrected'))")
  await knex.raw(`ALTER TABLE odometer_readings ADD CONSTRAINT odo_reason_chk CHECK (
    (corrected_km IS NULL AND corrected_fuel_level IS NULL) OR correction_reason IS NOT NULL)`)
  await addUpdatedAtTrigger(knex, 'odometer_readings')

  await knex.schema.createTable('expenses', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'))
    t.uuid('delivery_order_id').notNullable().references('id').inTable('delivery_orders')
    t.text('category_code').notNullable().references('code').inTable('expense_categories')
    t.bigInteger('amount').notNullable() // nilai efektif (Rupiah)
    t.text('description')
    t.uuid('proof_media_id').unique().references('id').inTable('media') // struk BBM / bukti manual
    // khusus BBM (struk + OCR)
    t.text('merchant')
    t.text('fuel_type')
    t.decimal('liters', 8, 2)
    t.bigInteger('price_per_liter')
    t.time('receipt_time')
    t.jsonb('ocr_fields') // hasil OCR mentah
    t.jsonb('corrected_fields') // hanya field yang dikoreksi
    t.text('correction_reason')
    t.jsonb('checks') // {liters_x_price_matches_total, receipt_time_within_do, ...}
    t.text('receipt_fingerprint') // hash(tanggal|jam|total|liter|jenis) untuk DUPLICATE_RECEIPT
    t.timestamp('recorded_at', { useTz: true }).notNullable() // waktu di HP
    t.decimal('lat', 9, 6)
    t.decimal('lng', 9, 6)
    t.decimal('gps_accuracy_m', 7, 2)
    t.uuid('client_ref').notNullable()
    t.timestamp('voided_at', { useTz: true }) // dibatalkan admin, tidak dihapus
    t.uuid('voided_by')
    addAudit(knex, t)
    t.unique(['created_by', 'client_ref'])
  })
  await knex.raw('ALTER TABLE expenses ADD CONSTRAINT expenses_amount_chk CHECK (amount >= 0)')
  await knex.raw('ALTER TABLE expenses ADD CONSTRAINT expenses_correction_chk CHECK (corrected_fields IS NULL OR correction_reason IS NOT NULL)')
  await knex.raw('CREATE INDEX expenses_do_idx ON expenses (delivery_order_id) WHERE voided_at IS NULL')
  await knex.raw(`CREATE UNIQUE INDEX expenses_receipt_uq ON expenses (receipt_fingerprint)
    WHERE receipt_fingerprint IS NOT NULL AND voided_at IS NULL`)
  await addUpdatedAtTrigger(knex, 'expenses')
}

exports.down = async (knex) => {
  await knex.schema.dropTableIfExists('expenses')
  await knex.schema.dropTableIfExists('odometer_readings')
  await knex.schema.dropTableIfExists('loadings')
  await knex.schema.dropTableIfExists('delivery_order_media')
  await knex.schema.dropTableIfExists('expense_categories')
}
