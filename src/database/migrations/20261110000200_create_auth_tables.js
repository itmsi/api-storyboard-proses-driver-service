const { addAudit, addUpdatedAtTrigger } = require('../helpers/audit')
const { ensureDefaultRoles } = require('../tenant/default-roles')

// Identitas & akses (skema: database/schema.draft.sql bagian 1). Database sudah per client,
// jadi tidak ada kolom client_id.
//
// Role dan hak akses: SETIAP akun (admin dan driver) punya satu role (users.role_id). Role punya jenis akun (user_type: admin | driver),
// dan berisi matriks hak per modul. Jenis akun akun dibaca dari role-nya. Role bawaan: Administrator (semua hak admin, terkunci)
// dan Driver (default permission driver), disiapkan seeder default-roles.js di akhir migrasi ini.
exports.up = async (knex) => {
  await knex.schema.createTable('roles', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'))
    t.text('code').notNullable() // administrator, driver, supervisor
    t.text('name').notNullable()
    t.text('description')
    t.jsonb('permissions').notNullable().defaultTo('{}') // { "drivers": ["read","create"], ... }
    t.text('user_type').notNullable().defaultTo('admin') // jenis akun pemakai role: admin | driver
    t.boolean('is_system').notNullable().defaultTo(false) // role bawaan
    t.boolean('is_active').notNullable().defaultTo(true)
    addAudit(knex, t, { softDelete: true })
  })
  await knex.raw("ALTER TABLE roles ADD CONSTRAINT roles_user_type_chk CHECK (user_type IN ('admin', 'driver'))")
  await knex.raw('CREATE UNIQUE INDEX roles_code_uq ON roles (lower(code)) WHERE is_delete = false')
  await knex.raw('CREATE UNIQUE INDEX roles_name_uq ON roles (lower(name)) WHERE is_delete = false')
  await addUpdatedAtTrigger(knex, 'roles')
  await ensureDefaultRoles(knex) // Administrator dan Driver

  await knex.schema.createTable('users', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'))
    t.text('username').notNullable() // DRV-0021 / admin.budi
    t.text('phone') // E.164: +62812...
    t.text('email')
    t.text('password_hash').notNullable() // bcrypt
    t.uuid('role_id').notNullable().references('id').inTable('roles') // jenis akun dan hak akses dibaca dari role
    t.text('name').notNullable()
    t.text('language').notNullable().defaultTo('id')
    t.text('status').notNullable().defaultTo('active')
    t.integer('failed_login_count').notNullable().defaultTo(0)
    t.timestamp('locked_until', { useTz: true })
    t.timestamp('last_login_at', { useTz: true })
    // Akun sistem MSI (mis. msi.support): dibuat seeder, passwordnya dikelola saas-api, disembunyikan dari pengelolaan akun perusahaan
    t.boolean('is_system').notNullable().defaultTo(false)
    addAudit(knex, t, { softDelete: true })
  })
  await knex.raw("ALTER TABLE users ADD CONSTRAINT users_language_chk CHECK (language IN ('id', 'en', 'zh'))")
  await knex.raw("ALTER TABLE users ADD CONSTRAINT users_status_chk CHECK (status IN ('active', 'suspended'))")
  await knex.raw('CREATE UNIQUE INDEX users_username_uq ON users (lower(username)) WHERE is_delete = false')
  await knex.raw('CREATE UNIQUE INDEX users_phone_uq ON users (phone) WHERE is_delete = false AND phone IS NOT NULL')
  // Email dipakai untuk login admin; unik di antara akun yang belum dihapus (huruf besar/kecil tidak dibedakan)
  await knex.raw('CREATE UNIQUE INDEX users_email_uq ON users (lower(email)) WHERE is_delete = false AND email IS NOT NULL')
  // Satu database paling banyak satu akun sistem
  await knex.raw('CREATE UNIQUE INDEX users_system_uq ON users (is_system) WHERE is_system = true AND is_delete = false')
  await knex.raw('CREATE INDEX users_role_id_idx ON users (role_id)')
  await addUpdatedAtTrigger(knex, 'users')

  await knex.schema.createTable('drivers', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'))
    t.uuid('user_id').notNullable().unique().references('id')
      .inTable('users')
    t.text('code').notNullable().unique() // DRV-0021
    t.text('license_no')
    t.text('license_type')
    t.date('license_expires_on')
    t.text('status').notNullable().defaultTo('active')
    addAudit(knex, t, { softDelete: true })
  })
  await knex.raw("ALTER TABLE drivers ADD CONSTRAINT drivers_status_chk CHECK (status IN ('active', 'inactive'))")
  await addUpdatedAtTrigger(knex, 'drivers')
  await knex.raw('CREATE SEQUENCE driver_code_seq') // kode driver otomatis DRV-0001, DRV-0002, ...

  await knex.schema.createTable('devices', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'))
    t.uuid('user_id').notNullable().references('id').inTable('users')
    t.text('device_id').notNullable() // android-7f3a
    t.text('platform').notNullable().defaultTo('android')
    t.text('os_version')
    t.text('app_version')
    t.text('fcm_token')
    t.timestamp('last_seen_at', { useTz: true })
    addAudit(knex, t)
    t.unique(['user_id', 'device_id'])
  })
  await addUpdatedAtTrigger(knex, 'devices')

  // Hanya HASH token yang disimpan; rotasi tiap refresh, reuse terdeteksi lewat family_id
  await knex.schema.createTable('refresh_tokens', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'))
    t.uuid('user_id').notNullable().references('id').inTable('users')
    t.uuid('device_id').references('id').inTable('devices')
    t.uuid('family_id').notNullable()
    t.text('token_hash').notNullable().unique() // sha256(token)
    t.timestamp('expires_at', { useTz: true }).notNullable()
    t.timestamp('revoked_at', { useTz: true })
    t.uuid('replaced_by')
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now())
  })
  await knex.raw('CREATE INDEX refresh_tokens_user_idx ON refresh_tokens (user_id) WHERE revoked_at IS NULL')
  await knex.raw('CREATE INDEX refresh_tokens_family_idx ON refresh_tokens (family_id)')
}

exports.down = async (knex) => {
  await knex.schema.dropTableIfExists('refresh_tokens')
  await knex.schema.dropTableIfExists('devices')
  await knex.schema.dropTableIfExists('drivers')
  await knex.raw('DROP SEQUENCE IF EXISTS driver_code_seq')
  await knex.schema.dropTableIfExists('users')
  await knex.schema.dropTableIfExists('roles')
}
