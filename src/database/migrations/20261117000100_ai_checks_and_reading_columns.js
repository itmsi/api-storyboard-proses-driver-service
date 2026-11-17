const { addAudit, addUpdatedAtTrigger } = require('../helpers/audit')

// Pengecekan foto dengan AI (docs/PLAN-OCR.md): tabel pekerjaan/hasil AI, dan kolom pembanding di bacaan odometer dan biaya.
// Tiga nilai dipisah dan tidak saling menimpa: OCR FE (ocr_*, sudah ada), AI (ai_*), dan koreksi driver (corrected_*, sudah ada).
// effective_* tetap dari koreksi lalu OCR FE; hasil AI hanya pembanding. Kolom verifikasi admin bersifat opsional (boleh kosong).
//
// Dibuat sebagai migrasi baru (bukan dilipat ke migrasi pembuat) karena database sudah berjalan; boleh dilipat nanti bila diputuskan.

const LEVELS = "('empty', 'quarter', 'half', 'three_quarter', 'full')"
const VERDICTS = "('ocr_fe', 'ai', 'corrected', 'none')"

exports.up = async (knex) => {
  await knex.schema.createTable('ai_checks', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'))
    // Satu pengecekan per foto: foto yang sama tidak dibaca dua kali (hasil yang ada dipakai ulang)
    t.uuid('media_id').notNullable().unique().references('id')
      .inTable('media')
    t.text('kind').notNullable() // dashboard (odometer + bahan bakar) | receipt (struk BBM); diturunkan dari media.kind
    t.text('status').notNullable().defaultTo('queued')
    t.integer('attempts').notNullable().defaultTo(0)
    t.jsonb('result') // hasil yang sudah dinormalkan (bentuk sama dengan OCR FE): {km, fuel_level, confidence} atau field struk
    t.jsonb('raw') // jawaban mentah model; boleh dikosongkan untuk baris lama (retensi) tanpa menyentuh bacaan
    t.decimal('confidence', 3, 2)
    t.text('model')
    t.jsonb('usage') // pemakaian token, dasar penagihan per client nanti
    t.text('error_code') // kode AiError terakhir bila gagal
    t.text('error_message')
    t.uuid('requested_by').references('id').inTable('users')
    t.timestamp('started_at', { useTz: true })
    t.timestamp('finished_at', { useTz: true })
    addAudit(knex, t)
  })
  await knex.raw("ALTER TABLE ai_checks ADD CONSTRAINT ai_checks_kind_chk CHECK (kind IN ('dashboard', 'receipt'))")
  await knex.raw("ALTER TABLE ai_checks ADD CONSTRAINT ai_checks_status_chk CHECK (status IN ('queued', 'processing', 'done', 'failed'))")
  await knex.raw('ALTER TABLE ai_checks ADD CONSTRAINT ai_checks_attempts_chk CHECK (attempts >= 0)')
  await knex.raw('ALTER TABLE ai_checks ADD CONSTRAINT ai_checks_confidence_chk CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1))')
  await knex.raw("ALTER TABLE ai_checks ADD CONSTRAINT ai_checks_done_chk CHECK (status <> 'done' OR result IS NOT NULL)")
  // Pemulihan antrean: cari pekerjaan yang belum selesai
  await knex.raw("CREATE INDEX ai_checks_pending_idx ON ai_checks (status, created_at) WHERE status IN ('queued', 'processing')")
  await addUpdatedAtTrigger(knex, 'ai_checks')

  // ---- bacaan odometer / bahan bakar ----
  await knex.schema.alterTable('odometer_readings', (t) => {
    t.integer('ai_km')
    t.text('ai_fuel_level')
    t.decimal('ai_confidence', 3, 2)
    t.uuid('ai_check_id').references('id').inTable('ai_checks')
    t.boolean('needs_review').notNullable().defaultTo(false) // penanda otomatis (nilai berbeda, keyakinan rendah, tidak wajar)
    t.specificType('review_reasons', 'text[]').notNullable().defaultTo('{}')
    // verifikasi admin (opsional, boleh kosong; tidak mengubah ocr_*, ai_*, corrected_*, maupun effective_*)
    t.integer('verified_km')
    t.text('verified_fuel_level')
    t.text('verdict')
    t.uuid('verified_by')
    t.timestamp('verified_at', { useTz: true })
    t.text('verified_note')
  })
  await knex.raw(`ALTER TABLE odometer_readings ADD CONSTRAINT odo_ai_fuel_chk CHECK (ai_fuel_level IS NULL OR ai_fuel_level IN ${LEVELS})`)
  await knex.raw(`ALTER TABLE odometer_readings ADD CONSTRAINT odo_ver_fuel_chk CHECK (verified_fuel_level IS NULL OR verified_fuel_level IN ${LEVELS})`)
  await knex.raw(`ALTER TABLE odometer_readings ADD CONSTRAINT odo_verdict_chk CHECK (verdict IS NULL OR verdict IN ${VERDICTS})`)
  await knex.raw('ALTER TABLE odometer_readings ADD CONSTRAINT odo_ai_conf_chk CHECK (ai_confidence IS NULL OR (ai_confidence >= 0 AND ai_confidence <= 1))')
  await knex.raw('ALTER TABLE odometer_readings ADD CONSTRAINT odo_verified_chk CHECK ((verdict IS NULL) = (verified_at IS NULL))')
  await knex.raw('CREATE INDEX odo_needs_review_idx ON odometer_readings (delivery_order_id) WHERE needs_review')

  // ---- biaya (struk BBM) ----
  await knex.schema.alterTable('expenses', (t) => {
    t.jsonb('ai_fields') // hasil AI yang dinormalkan, bentuk sama dengan ocr_fields
    t.decimal('ai_confidence', 3, 2)
    t.uuid('ai_check_id').references('id').inTable('ai_checks')
    t.boolean('needs_review').notNullable().defaultTo(false)
    t.specificType('review_reasons', 'text[]').notNullable().defaultTo('{}')
    t.bigInteger('verified_amount')
    t.text('verdict')
    t.uuid('verified_by')
    t.timestamp('verified_at', { useTz: true })
    t.text('verified_note')
  })
  await knex.raw(`ALTER TABLE expenses ADD CONSTRAINT expenses_verdict_chk CHECK (verdict IS NULL OR verdict IN ${VERDICTS})`)
  await knex.raw('ALTER TABLE expenses ADD CONSTRAINT expenses_ai_conf_chk CHECK (ai_confidence IS NULL OR (ai_confidence >= 0 AND ai_confidence <= 1))')
  await knex.raw('ALTER TABLE expenses ADD CONSTRAINT expenses_verified_chk CHECK ((verdict IS NULL) = (verified_at IS NULL))')
  await knex.raw('ALTER TABLE expenses ADD CONSTRAINT expenses_verified_amount_chk CHECK (verified_amount IS NULL OR verified_amount >= 0)')
  await knex.raw('CREATE INDEX expenses_needs_review_idx ON expenses (delivery_order_id) WHERE needs_review AND voided_at IS NULL')
}

exports.down = async (knex) => {
  await knex.raw('DROP INDEX IF EXISTS expenses_needs_review_idx')
  await knex.schema.alterTable('expenses', (t) => {
    t.dropColumns('ai_fields', 'ai_confidence', 'ai_check_id', 'needs_review', 'review_reasons', 'verified_amount', 'verdict', 'verified_by', 'verified_at', 'verified_note')
  })
  await knex.raw('DROP INDEX IF EXISTS odo_needs_review_idx')
  await knex.schema.alterTable('odometer_readings', (t) => {
    t.dropColumns(
      'ai_km',
      'ai_fuel_level',
      'ai_confidence',
      'ai_check_id',
      'needs_review',
      'review_reasons',
      'verified_km',
      'verified_fuel_level',
      'verdict',
      'verified_by',
      'verified_at',
      'verified_note'
    )
  })
  await knex.schema.dropTableIfExists('ai_checks')
}
