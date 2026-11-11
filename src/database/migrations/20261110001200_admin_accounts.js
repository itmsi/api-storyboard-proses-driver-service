// Pendukung API admin (A1): email akun unik, dan nomor urut kode driver otomatis (DRV-0001, ...).
exports.up = async (knex) => {
  // Email dipakai untuk login admin; unik di antara akun yang belum dihapus (huruf besar/kecil tidak dibedakan)
  await knex.raw('CREATE UNIQUE INDEX users_email_uq ON users (lower(email)) WHERE is_delete = false AND email IS NOT NULL')
  await knex.raw('CREATE SEQUENCE driver_code_seq')
}

exports.down = async (knex) => {
  await knex.raw('DROP SEQUENCE IF EXISTS driver_code_seq')
  await knex.raw('DROP INDEX IF EXISTS users_email_uq')
}
