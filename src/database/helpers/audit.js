/**
 * Kolom audit standar (sama dengan api-hrm), dipasang di semua tabel bisnis:
 *   created_at, created_by, updated_at, updated_by
 * Tabel master/aktif ditambah soft delete: deleted_at, deleted_by, is_delete.
 * created_by / updated_by / deleted_by = users.id (tanpa FK agar tidak melingkar dan tidak menghalangi hapus user).
 * updated_at diisi trigger set_updated_at().
 */
const addAudit = (knex, t, { softDelete = false } = {}) => {
  t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now())
  t.uuid('created_by')
  t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now())
  t.uuid('updated_by')
  if (softDelete) {
    t.timestamp('deleted_at', { useTz: true })
    t.uuid('deleted_by')
    t.boolean('is_delete').notNullable().defaultTo(false)
  }
}

const addUpdatedAtTrigger = (knex, table) => knex.raw(
  `CREATE TRIGGER ${table}_updated_at BEFORE UPDATE ON ${table} FOR EACH ROW EXECUTE FUNCTION set_updated_at()`
)

module.exports = { addAudit, addUpdatedAtTrigger }
