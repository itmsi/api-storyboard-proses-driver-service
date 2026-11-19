// DO ulang dari DO yang gagal kirim: DO baru menunjuk DO asalnya (rescheduled_from_id) dan DO asal menunjuk DO barunya (rescheduled_to_id).
// Kedua arah disimpan supaya membaca keduanya cukup lewat id DO itu sendiri. Tanpa indeks tambahan.
exports.up = (knex) => knex.schema.alterTable('delivery_orders', (t) => {
  t.uuid('rescheduled_from_id').references('id').inTable('delivery_orders')
  t.uuid('rescheduled_to_id').references('id').inTable('delivery_orders')
})

exports.down = (knex) => knex.schema.alterTable('delivery_orders', (t) => {
  t.dropColumn('rescheduled_to_id')
  t.dropColumn('rescheduled_from_id')
})
