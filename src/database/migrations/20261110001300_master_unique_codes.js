// A2: kode tipe unit dan customer harus unik hanya di antara data yang belum dihapus,
// supaya kode dari data yang sudah dihapus (soft delete) bisa dipakai lagi (sama seperti plat unit).
exports.up = async (knex) => {
  await knex.raw('ALTER TABLE unit_types DROP CONSTRAINT IF EXISTS unit_types_code_unique')
  await knex.raw('CREATE UNIQUE INDEX unit_types_code_uq ON unit_types (code) WHERE is_delete = false')
  await knex.raw('ALTER TABLE customers DROP CONSTRAINT IF EXISTS customers_code_unique')
  await knex.raw('CREATE UNIQUE INDEX customers_code_uq ON customers (code) WHERE is_delete = false')
}

exports.down = async (knex) => {
  // Kode kembar dari data yang sudah dihapus (soft delete) menghalangi unique global: beri akhiran id agar tetap unik
  await knex.raw("UPDATE customers SET code = code || '#' || id WHERE is_delete = true")
  await knex.raw("UPDATE unit_types SET code = code || '#' || id WHERE is_delete = true")
  await knex.raw('DROP INDEX IF EXISTS customers_code_uq')
  await knex.raw('ALTER TABLE customers ADD CONSTRAINT customers_code_unique UNIQUE (code)')
  await knex.raw('DROP INDEX IF EXISTS unit_types_code_uq')
  await knex.raw('ALTER TABLE unit_types ADD CONSTRAINT unit_types_code_unique UNIQUE (code)')
}
