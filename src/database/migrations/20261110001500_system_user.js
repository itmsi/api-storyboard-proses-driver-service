// Akun sistem MSI ("ghost user", mis. msi.support): admin bawaan di database tiap perusahaan untuk dukungan,
// dibuat oleh seeder dan passwordnya dikelola saas-api. Disembunyikan dari pengelolaan akun perusahaan.
exports.up = async (knex) => {
  await knex.schema.alterTable('users', (t) => {
    t.boolean('is_system').notNullable().defaultTo(false)
  })
  // Satu database paling banyak satu akun sistem
  await knex.raw('CREATE UNIQUE INDEX users_system_uq ON users (is_system) WHERE is_system = true AND is_delete = false')
}

exports.down = async (knex) => {
  await knex.raw('DROP INDEX IF EXISTS users_system_uq')
  await knex.schema.alterTable('users', (t) => {
    t.dropColumn('is_system')
  })
}
