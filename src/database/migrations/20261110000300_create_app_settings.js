const { addAudit, addUpdatedAtTrigger } = require('../helpers/audit')

// Pengaturan per client (key-value). Dipakai GET /config; nilai yang tidak diisi memakai default di kode.
exports.up = async (knex) => {
  await knex.schema.createTable('app_settings', (t) => {
    t.text('key').primary()
    t.jsonb('value').notNullable()
    addAudit(knex, t)
  })
  await addUpdatedAtTrigger(knex, 'app_settings')
}

exports.down = (knex) => knex.schema.dropTableIfExists('app_settings')
