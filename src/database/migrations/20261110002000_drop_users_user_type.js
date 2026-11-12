// Role terpadu (langkah 8, docs/PLAN-ROLE-TERPADU.md): jenis akun kini dibaca dari roles.user_type lewat users.role_id,
// jadi kolom users.user_type dihapus dan role_id wajib terisi. Hanya satu sumber kebenaran.
exports.up = async (knex) => {
  // Pengaman data lama: akun tanpa role dipasangi role bawaan sesuai jenis akunnya
  await knex.raw(`
    UPDATE users SET role_id = (SELECT id FROM roles WHERE is_system = true AND user_type = users.user_type AND is_delete = false LIMIT 1)
    WHERE role_id IS NULL
  `)
  await knex.raw('ALTER TABLE users ALTER COLUMN role_id SET NOT NULL')
  await knex.raw('ALTER TABLE users DROP CONSTRAINT users_user_type_chk')
  await knex.schema.alterTable('users', (t) => t.dropColumn('user_type'))
}

exports.down = async (knex) => {
  await knex.schema.alterTable('users', (t) => t.text('user_type'))
  await knex.raw('UPDATE users SET user_type = (SELECT user_type FROM roles WHERE roles.id = users.role_id)')
  await knex.raw('ALTER TABLE users ALTER COLUMN user_type SET NOT NULL')
  await knex.raw("ALTER TABLE users ADD CONSTRAINT users_user_type_chk CHECK (user_type IN ('driver', 'admin', 'dispatcher', 'finance'))")
  await knex.raw('ALTER TABLE users ALTER COLUMN role_id DROP NOT NULL')
}
