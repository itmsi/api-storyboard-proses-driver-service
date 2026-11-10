/**
 * Blok audit standar di response:
 *   { created_at, created_by: { id, name } | null, updated_at, updated_by: { id, name } | null }
 *
 * Query repository harus meng-alias kolom nama pembuat/pengubah:
 *   leftJoin('users as cu', 'cu.id', 'x.created_by').select('cu.name as created_by_name')
 *   leftJoin('users as uu', 'uu.id', 'x.updated_by').select('uu.name as updated_by_name')
 * atau pakai withAuditNames(query, 'x') di bawah.
 * Waktu diformat WIB (+07:00) sesuai kontrak.
 */
const { toWib: toIso } = require('./date')

const person = (id, name) => (id ? { id, name: name || null } : null)

const auditFields = (row) => ({
  created_at: toIso(row.created_at),
  created_by: person(row.created_by, row.created_by_name),
  updated_at: toIso(row.updated_at),
  updated_by: person(row.updated_by, row.updated_by_name),
})

/** Tambahkan join nama pembuat & pengubah ke query knex untuk tabel `table`. */
const withAuditNames = (query, table) => query
  .leftJoin('users as audit_cu', 'audit_cu.id', `${table}.created_by`)
  .leftJoin('users as audit_uu', 'audit_uu.id', `${table}.updated_by`)
  .select('audit_cu.name as created_by_name', 'audit_uu.name as updated_by_name')

module.exports = { auditFields, withAuditNames, toIso }
