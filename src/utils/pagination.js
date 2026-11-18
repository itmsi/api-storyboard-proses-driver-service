const Joi = require('joi')

/**
 * Pagination standar untuk semua daftar di API admin:
 *   { page: 1, limit: 20, search: 'andi', sort: 'created_at', sort_by: 'DESC' }
 * `sort` = kolom urut, `sort_by` = arah urut (DESC default, atau ASC).
 * Response: data = array, meta = { page, limit, total, total_pages }.
 */
const MAX_LIMIT = 100
const SORT_DIRECTIONS = ['DESC', 'ASC']

/** Skema query dasar; endpoint menambahkan filter miliknya dengan `.keys({...})`. */
const listQuery = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(MAX_LIMIT)
    .default(20),
  search: Joi.string().trim().max(100).allow(''),
  sort: Joi.string().trim().max(60),
  sort_by: Joi.string().trim().uppercase().valid(...SORT_DIRECTIONS)
    .default('DESC'),
})

/**
 * @param {object} query  hasil validasi listQuery
 * @param {object} sortable  { namaSort: 'kolom.sql' } kolom yang boleh dipakai (whitelist, cegah SQL injection)
 * @param {string} defaultSort  kolom default, mis. 'created_at' (awalan `-` lama tetap diterima dan diabaikan)
 *
 * Arah urut selalu dari `sort_by` (default DESC). Awalan `-` di `sort` hanya untuk kompatibilitas klien lama.
 */
const parse = (query, sortable, defaultSort) => {
  const key = (query.sort || defaultSort).replace(/^-/, '')
  const column = sortable[key] || sortable[defaultSort.replace(/^-/, '')]
  const desc = (query.sort_by || 'DESC').toUpperCase() !== 'ASC'
  return {
    page: query.page,
    limit: query.limit,
    offset: (query.page - 1) * query.limit,
    column,
    direction: desc ? 'desc' : 'asc',
  }
}

const meta = (paging, total) => ({
  page: paging.page,
  limit: paging.limit,
  total,
  total_pages: Math.max(1, Math.ceil(total / paging.limit)),
})

/** Pencarian teks sederhana (ILIKE) di beberapa kolom; karakter wildcard dari pengguna di-escape. */
const searchColumns = (query, term, columns) => {
  if (!term) return query
  const like = `%${term.replace(/[\\%_]/g, (c) => `\\${c}`)}%`
  return query.where((q) => columns.forEach((col) => q.orWhereRaw(`${col} ILIKE ?`, [like])))
}

module.exports = {
  listQuery, parse, meta, searchColumns, MAX_LIMIT, SORT_DIRECTIONS,
}
