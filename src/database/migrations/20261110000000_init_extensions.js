// Migrasi awal: extension yang dibutuhkan skema.
// Tabel bisnis ditambahkan setelah rancangan di src/database/schema.draft.sql disepakati.

exports.up = async (knex) => {
  await knex.raw('CREATE EXTENSION IF NOT EXISTS pgcrypto') // gen_random_uuid(), digest()
}

exports.down = async (knex) => {
  await knex.raw('DROP EXTENSION IF EXISTS pgcrypto')
}
