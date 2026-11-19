// Satu DO bisa punya banyak tujuan berurutan. delivery_orders.destinations = [{ step, location_id, snapshot }]. Pemberhentian terakhir tetap
// disalin ke destination_location_id dan destination_snapshot (tujuan akhir) supaya serah terima, filter, dan tampilan lama tidak berubah.
// DO yang sudah ada diisi satu pemberhentian dari kolom destination_* (isi kolom lama tidak berubah).
exports.up = async (knex) => {
  await knex.schema.alterTable('delivery_orders', (t) => {
    t.jsonb('destinations')
  })
  await knex.raw(`UPDATE delivery_orders SET destinations = jsonb_build_array(
    jsonb_build_object('step', 1, 'location_id', destination_location_id, 'snapshot', destination_snapshot))`)
}

exports.down = (knex) => knex.schema.alterTable('delivery_orders', (t) => {
  t.dropColumn('destinations')
})
