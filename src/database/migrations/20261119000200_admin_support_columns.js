// Pendukung web admin:
//  - units.driver_assigned_at: sejak kapan driver menjadi driver tetap unit ("Driver tetap sejak ..." di form driver). Diisi saat driver_id unit
//    berubah. Unit yang sudah punya driver diisi dengan waktu ubah terakhirnya (perkiraan: waktu sebenarnya tidak pernah dicatat).
//  - refresh_tokens.user_agent dan ip: perangkat dan alamat sesi login ("Masuk sejak ... dari Chrome, Windows" di Pengaturan).
exports.up = async (knex) => {
  await knex.schema.alterTable('units', (t) => {
    t.timestamp('driver_assigned_at', { useTz: true })
  })
  await knex.raw('UPDATE units SET driver_assigned_at = updated_at WHERE driver_id IS NOT NULL')
  await knex.schema.alterTable('refresh_tokens', (t) => {
    t.text('user_agent')
    t.text('ip')
  })
}

exports.down = async (knex) => {
  await knex.schema.alterTable('refresh_tokens', (t) => {
    t.dropColumn('ip')
    t.dropColumn('user_agent')
  })
  await knex.schema.alterTable('units', (t) => {
    t.dropColumn('driver_assigned_at')
  })
}
