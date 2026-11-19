// Soft delete DO: baris tetap ada (nomor DO tidak dipakai ulang), hilang dari semua daftar, detail, hitungan, dan cek bentrok.
exports.up = async (knex) => {
  await knex.schema.alterTable('delivery_orders', (t) => {
    t.timestamp('deleted_at', { useTz: true })
    t.uuid('deleted_by')
    t.boolean('is_delete').notNullable().defaultTo(false)
  })
}

exports.down = async (knex) => {
  await knex.schema.alterTable('delivery_orders', (t) => {
    t.dropColumn('deleted_at')
    t.dropColumn('deleted_by')
    t.dropColumn('is_delete')
  })
}
