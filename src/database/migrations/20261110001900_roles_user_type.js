// Role terpadu (langkah 1, docs/PLAN-ROLE-TERPADU.md): role punya jenis akun (admin/driver), ada role bawaan Driver
// dengan default permission, dan semua akun driver yang sudah ada dipasangi role Driver.
// Isi default dibekukan di sini (snapshot); perubahan berikutnya dikerjakan seeder default-roles.js.
const DRIVER_DEFAULTS = {
  driver_profile: ['read', 'update'],
  driver_delivery_orders: ['read', 'update'],
  driver_p2h: ['read', 'create'],
  driver_trip: ['create'],
  driver_expenses: ['read', 'create'],
  driver_media: ['read', 'create'],
  driver_sync: ['create'],
  driver_device: ['create'],
}

exports.up = async (knex) => {
  await knex.schema.alterTable('roles', (t) => {
    t.text('user_type').notNullable().defaultTo('admin')
  })
  await knex.raw("ALTER TABLE roles ADD CONSTRAINT roles_user_type_chk CHECK (user_type IN ('admin', 'driver'))")

  await knex.raw(`
    INSERT INTO roles (code, name, description, permissions, is_system, user_type)
    SELECT 'driver', 'Driver', 'Akun driver (aplikasi HP) dengan hak bawaan', ?::jsonb, true, 'driver'
    WHERE NOT EXISTS (SELECT 1 FROM roles WHERE is_system = true AND user_type = 'driver' AND is_delete = false)
  `, [JSON.stringify(DRIVER_DEFAULTS)])

  await knex.raw(`
    UPDATE users SET role_id = (SELECT id FROM roles WHERE is_system = true AND user_type = 'driver' AND is_delete = false LIMIT 1)
    WHERE user_type = 'driver' AND role_id IS NULL
  `)
}

exports.down = async (knex) => {
  await knex.raw("UPDATE users SET role_id = NULL WHERE user_type = 'driver'")
  await knex.raw("DELETE FROM roles WHERE user_type = 'driver'")
  await knex.raw('ALTER TABLE roles DROP CONSTRAINT roles_user_type_chk')
  await knex.schema.alterTable('roles', (t) => t.dropColumn('user_type'))
}
