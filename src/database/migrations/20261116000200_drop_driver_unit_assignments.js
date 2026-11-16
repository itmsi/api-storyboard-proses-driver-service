const { addAudit, addUpdatedAtTrigger } = require('../helpers/audit')

// Tabel penugasan unit harian dihapus: unit yang dipegang driver pada suatu tanggal dibaca langsung dari DO (driver, unit,
// tanggal kerja) dan dari driver bawaan unit (units.driver_id). Baris lama hanyalah salinan DO; yang tidak punya DO (dibuat
// lewat endpoint lama yang sudah dihapus) ikut hilang.
exports.up = async (knex) => {
  await knex.raw('DROP TABLE IF EXISTS driver_unit_assignments')
}

// Mengembalikan tabel kosong (data lama tidak dipulihkan), supaya rollback migrasi sebelumnya tetap berjalan.
exports.down = async (knex) => {
  if (await knex.schema.hasTable('driver_unit_assignments')) return
  await knex.schema.createTable('driver_unit_assignments', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'))
    t.uuid('driver_id').notNullable().references('id').inTable('drivers')
    t.uuid('unit_id').notNullable().references('id').inTable('units')
    t.date('work_date').notNullable()
    addAudit(knex, t)
    t.unique(['driver_id', 'work_date'])
  })
  await addUpdatedAtTrigger(knex, 'driver_unit_assignments')
  await knex.raw('CREATE UNIQUE INDEX IF NOT EXISTS driver_unit_assignments_unit_date_uq ON driver_unit_assignments (unit_id, work_date)')
}
