// A4: alasan pembatalan biaya oleh admin, dan catatan saat uang jalan ditandai sudah disetor/dibayar.
exports.up = async (knex) => {
  await knex.schema.alterTable('expenses', (t) => {
    t.text('void_reason')
  })
  await knex.schema.alterTable('settlements', (t) => {
    t.text('note')
  })
}

exports.down = async (knex) => {
  await knex.schema.alterTable('settlements', (t) => {
    t.dropColumn('note')
  })
  await knex.schema.alterTable('expenses', (t) => {
    t.dropColumn('void_reason')
  })
}
