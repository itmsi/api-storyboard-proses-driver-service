const { addAudit, addUpdatedAtTrigger } = require('../helpers/audit')

// Master unit kendaraan (skema: schema.draft.sql bagian 2). Tipe unit berupa teks di unit (tanpa master tipe), dan tidak ada tabel
// penugasan unit harian: unit driver per hari dibaca dari DO dan driver bawaan unit (units.driver_id).
exports.up = async (knex) => {
  await knex.schema.createTable('units', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'))
    t.text('plate').notNullable() // B 9123 KZ
    t.text('unit_type').notNullable() // teks bebas: CDD Bak, Fuso Box, dst.
    t.integer('max_load_kg') // kapasitas muatan (kg), opsional
    t.text('brand')
    t.smallint('year')
    t.text('vin_number') // nomor rangka (VIN), huruf besar; unik di antara unit yang belum dihapus
    t.integer('last_odometer_km') // diperbarui saat odometer akhir
    t.text('status').notNullable().defaultTo('active')
    t.date('stnk_expires_on')
    t.date('kir_expires_on')
    // Driver bawaan unit: otomatis memegang unit ini setiap hari tanpa penugasan. Satu driver maksimal satu unit aktif.
    t.uuid('driver_id').references('id').inTable('drivers')
    addAudit(knex, t, { softDelete: true })
  })
  await knex.raw("ALTER TABLE units ADD CONSTRAINT units_status_chk CHECK (status IN ('active', 'maintenance', 'inactive'))")
  await knex.raw('CREATE UNIQUE INDEX units_vin_uq ON units (vin_number) WHERE vin_number IS NOT NULL AND is_delete = false')
  await knex.raw('CREATE UNIQUE INDEX units_driver_uq ON units (driver_id) WHERE driver_id IS NOT NULL AND is_delete = false')
  await knex.raw("CREATE UNIQUE INDEX units_plate_uq ON units (upper(replace(plate, ' ', ''))) WHERE is_delete = false")
  await addUpdatedAtTrigger(knex, 'units')
}

exports.down = async (knex) => {
  await knex.schema.dropTableIfExists('units')
}
