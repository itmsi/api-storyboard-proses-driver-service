// Nomor referensi dari customer (mis. no PO / no order customer) di DO: teks bebas, opsional, tidak harus unik.
exports.up = async (knex) => {
  await knex.schema.alterTable('delivery_orders', (t) => {
    t.text('customer_reference_no')
  })
}

exports.down = async (knex) => {
  await knex.schema.alterTable('delivery_orders', (t) => {
    t.dropColumn('customer_reference_no')
  })
}
