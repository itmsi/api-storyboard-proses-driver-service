const { addAudit, addUpdatedAtTrigger } = require('../helpers/audit')

// Master unit kendaraan + penugasan unit harian (skema: schema.draft.sql bagian 2)
exports.up = async (knex) => {
  await knex.schema.createTable('unit_types', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'))
    t.text('code').notNullable() // CDD_BAK, FUSO_BOX
    t.text('name').notNullable() // CDD Bak
    t.integer('max_load_kg')
    addAudit(knex, t, { softDelete: true })
  })
  // Kode unik hanya di antara data yang belum dihapus, supaya kode dari data yang sudah dihapus bisa dipakai lagi (sama seperti plat unit)
  await knex.raw('CREATE UNIQUE INDEX unit_types_code_uq ON unit_types (code) WHERE is_delete = false')
  await addUpdatedAtTrigger(knex, 'unit_types')

  await knex.schema.createTable('units', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'))
    t.text('plate').notNullable() // B 9123 KZ
    t.uuid('unit_type_id').notNullable().references('id').inTable('unit_types')
    t.text('brand')
    t.smallint('year')
    t.integer('last_odometer_km') // diperbarui saat odometer akhir
    t.text('status').notNullable().defaultTo('active')
    t.date('stnk_expires_on')
    t.date('kir_expires_on')
    addAudit(knex, t, { softDelete: true })
  })
  await knex.raw("ALTER TABLE units ADD CONSTRAINT units_status_chk CHECK (status IN ('active', 'maintenance', 'inactive'))")
  await knex.raw("CREATE UNIQUE INDEX units_plate_uq ON units (upper(replace(plate, ' ', ''))) WHERE is_delete = false")
  await addUpdatedAtTrigger(knex, 'units')

  // Penugasan unit harian (unit_today di /me dan bootstrap). Satu unit boleh dipakai beberapa driver di hari yang sama.
  await knex.schema.createTable('driver_unit_assignments', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'))
    t.uuid('driver_id').notNullable().references('id').inTable('drivers')
    t.uuid('unit_id').notNullable().references('id').inTable('units')
    t.date('work_date').notNullable() // tanggal lokal Asia/Jakarta
    addAudit(knex, t)
    t.unique(['driver_id', 'work_date'])
  })
  await addUpdatedAtTrigger(knex, 'driver_unit_assignments')
}

exports.down = async (knex) => {
  await knex.schema.dropTableIfExists('driver_unit_assignments')
  await knex.schema.dropTableIfExists('units')
  await knex.schema.dropTableIfExists('unit_types')
}
