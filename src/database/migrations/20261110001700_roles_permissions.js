const { addAudit, addUpdatedAtTrigger } = require('../helpers/audit')

// Role dan hak akses admin: tiap role berisi matriks hak per modul (read/create/update/delete), tiap user admin punya satu role.
// Role bawaan "Administrator" (is_system) memegang semua hak dan tidak bisa diubah atau dihapus.
exports.up = async (knex) => {
  await knex.schema.createTable('roles', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'))
    t.text('code').notNullable() // administrator, supervisor
    t.text('name').notNullable()
    t.text('description')
    t.jsonb('permissions').notNullable().defaultTo('{}') // { "drivers": ["read","create"], ... }
    t.boolean('is_system').notNullable().defaultTo(false)
    t.boolean('is_active').notNullable().defaultTo(true)
    addAudit(knex, t, { softDelete: true })
  })
  await knex.raw('CREATE UNIQUE INDEX roles_code_uq ON roles (lower(code)) WHERE is_delete = false')
  await knex.raw('CREATE UNIQUE INDEX roles_name_uq ON roles (lower(name)) WHERE is_delete = false')
  await addUpdatedAtTrigger(knex, 'roles')

  await knex.schema.alterTable('users', (t) => {
    t.uuid('role_id').references('id').inTable('roles') // hanya untuk akun admin
  })
  await knex.raw('CREATE INDEX users_role_id_idx ON users (role_id)')

  // permissions Administrator kosong: bendera is_system berarti "semua hak" (selalu mengikuti daftar modul terbaru)
  const [administrator] = await knex('roles').insert({
    code: 'administrator', name: 'Administrator', description: 'Akses penuh ke semua modul', is_system: true, permissions: '{}',
  }).returning('id')
  await knex('users').where({ role: 'admin' }).update({ role_id: administrator.id })
}

exports.down = async (knex) => {
  await knex.raw('DROP INDEX IF EXISTS users_role_id_idx')
  await knex.schema.alterTable('users', (t) => t.dropColumn('role_id'))
  await knex.schema.dropTableIfExists('roles')
}
