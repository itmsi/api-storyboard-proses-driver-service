// Indeks pencarian DO per driver dan per unit. Unit driver per hari (/me, P2H, daftar driver) dan aturan satu unit satu driver
// per tanggal kini dibaca dari delivery_orders, jadi filter driver_id/unit_id + status dipakai di jalur yang sering dipanggil.
exports.up = async (knex) => {
  await knex.raw('CREATE INDEX IF NOT EXISTS delivery_orders_driver_status_idx ON delivery_orders (driver_id, status)')
  await knex.raw('CREATE INDEX IF NOT EXISTS delivery_orders_unit_status_idx ON delivery_orders (unit_id, status)')
}

exports.down = async (knex) => {
  await knex.raw('DROP INDEX IF EXISTS delivery_orders_unit_status_idx')
  await knex.raw('DROP INDEX IF EXISTS delivery_orders_driver_status_idx')
}
