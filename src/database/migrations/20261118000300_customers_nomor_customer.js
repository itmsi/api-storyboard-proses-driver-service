// Nomor customer (mis. nomor pelanggan dari sistem customer/ERP): teks bebas, opsional, tidak harus unik.
exports.up = async (knex) => {
  await knex.schema.alterTable('customers', (t) => {
    t.text('nomor_customer')
  })
}

exports.down = async (knex) => {
  await knex.schema.alterTable('customers', (t) => {
    t.dropColumn('nomor_customer')
  })
}
