// Soft delete (deleted_at, deleted_by, is_delete) untuk resource yang sebelumnya hanya bisa dinonaktifkan/dibatalkan:
// P2H, media, item checklist P2H, kategori biaya. Baris tidak pernah dihapus fisik (jejak audit dan rujukan data lama tetap utuh).
const TABLES = ['p2h_inspections', 'media', 'p2h_check_items', 'expense_categories']

exports.up = async (knex) => {
  await Promise.all(TABLES.map((table) => knex.schema.alterTable(table, (t) => {
    t.timestamp('deleted_at', { useTz: true })
    t.uuid('deleted_by')
    t.boolean('is_delete').notNullable().defaultTo(false)
  })))
  // P2H yang dihapus tidak boleh menghalangi P2H baru untuk unit dan hari yang sama
  await knex.raw('DROP INDEX p2h_current_uq')
  await knex.raw('CREATE UNIQUE INDEX p2h_current_uq ON p2h_inspections (unit_id, inspection_date) WHERE superseded_at IS NULL AND is_delete = false')
}

exports.down = async (knex) => {
  await knex.raw('DROP INDEX p2h_current_uq')
  await knex.raw('DELETE FROM p2h_inspections WHERE is_delete = true')
  await knex.raw('CREATE UNIQUE INDEX p2h_current_uq ON p2h_inspections (unit_id, inspection_date) WHERE superseded_at IS NULL')
  await Promise.all(TABLES.map((table) => knex.schema.alterTable(table, (t) => {
    t.dropColumn('deleted_at')
    t.dropColumn('deleted_by')
    t.dropColumn('is_delete')
  })))
}
