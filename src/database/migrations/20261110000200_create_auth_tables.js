const { addAudit, addUpdatedAtTrigger } = require('../helpers/audit')

// Identitas & akses (skema: database/schema.draft.sql bagian 1). Database sudah per client,
// jadi tidak ada kolom client_id.
exports.up = async (knex) => {
  await knex.schema.createTable('users', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'))
    t.text('username').notNullable() // DRV-0021 / admin.budi
    t.text('phone') // E.164: +62812...
    t.text('email')
    t.text('password_hash').notNullable() // bcrypt
    t.text('role').notNullable()
    t.text('name').notNullable()
    t.text('language').notNullable().defaultTo('id')
    t.text('status').notNullable().defaultTo('active')
    t.integer('failed_login_count').notNullable().defaultTo(0)
    t.timestamp('locked_until', { useTz: true })
    t.timestamp('last_login_at', { useTz: true })
    addAudit(knex, t, { softDelete: true })
  })
  await knex.raw("ALTER TABLE users ADD CONSTRAINT users_role_chk CHECK (role IN ('driver', 'admin', 'dispatcher', 'finance'))")
  await knex.raw("ALTER TABLE users ADD CONSTRAINT users_language_chk CHECK (language IN ('id', 'en', 'zh'))")
  await knex.raw("ALTER TABLE users ADD CONSTRAINT users_status_chk CHECK (status IN ('active', 'suspended'))")
  await knex.raw('CREATE UNIQUE INDEX users_username_uq ON users (lower(username)) WHERE is_delete = false')
  await knex.raw('CREATE UNIQUE INDEX users_phone_uq ON users (phone) WHERE is_delete = false AND phone IS NOT NULL')
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
  await knex.schema.dropTableIfExists('users')
}
