// users.role (admin/driver) diganti namanya menjadi user_type: itu jenis akun, bukan role hak akses.
// Role hak akses ada di tabel roles (lewat users.role_id), jadi nama "role" tidak lagi dipakai untuk dua hal berbeda.
exports.up = async (knex) => {
  await knex.schema.alterTable('users', (t) => t.renameColumn('role', 'user_type'))
  await knex.raw('ALTER TABLE users RENAME CONSTRAINT users_role_chk TO users_user_type_chk')
}

exports.down = async (knex) => {
  await knex.raw('ALTER TABLE users RENAME CONSTRAINT users_user_type_chk TO users_role_chk')
  await knex.schema.alterTable('users', (t) => t.renameColumn('user_type', 'role'))
}
