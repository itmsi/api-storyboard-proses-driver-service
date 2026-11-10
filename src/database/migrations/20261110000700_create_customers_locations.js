const { addAudit, addUpdatedAtTrigger } = require('../helpers/audit')

// Master customer + lokasi (gudang, depot, alamat tujuan). Skema: schema.draft.sql bagian 2.
exports.up = async (knex) => {
  await knex.schema.createTable('customers', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'))
    t.text('code').notNullable().unique()
    t.text('name').notNullable() // PT Contoh Jaya
    t.text('phone')
    t.text('email')
    addAudit(knex, t, { softDelete: true })
  })
  await addUpdatedAtTrigger(knex, 'customers')

  await knex.schema.createTable('locations', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'))
    t.uuid('customer_id').references('id').inTable('customers') // null untuk gudang/depot sendiri
    t.text('type').notNullable()
    t.text('name').notNullable() // Gudang Cakung
    t.text('address').notNullable()
    t.text('city')
    t.decimal('lat', 9, 6)
    t.decimal('lng', 9, 6)
    t.integer('geofence_radius_m').defaultTo(200) // validasi GPS saat muat / serah terima
    t.text('operating_hours') // 08:00-17:00
    t.text('pic_name')
    t.text('pic_phone')
    addAudit(knex, t, { softDelete: true })
    t.index(['customer_id'], 'locations_customer_idx')
  })
  await knex.raw("ALTER TABLE locations ADD CONSTRAINT locations_type_chk CHECK (type IN ('warehouse', 'depot', 'customer_site'))")
  await addUpdatedAtTrigger(knex, 'locations')
}

exports.down = async (knex) => {
  await knex.schema.dropTableIfExists('locations')
  await knex.schema.dropTableIfExists('customers')
}
