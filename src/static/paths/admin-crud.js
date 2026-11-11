const {
  ref, envelope, jsonResponse, jsonBody, errorRef, secured,
} = require('../helpers')

// CRUD admin untuk P2H dan media. Daftar memakai POST + body (standar API), detail by id tetap GET.
const idPath = [{
  name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' }
}]
const errors = {
  401: jsonResponse('Token tidak ada / tidak valid / akun admin dinonaktifkan', ref('Error')),
  403: jsonResponse('Bukan token admin', ref('Error')),
  429: errorRef('RateLimited'),
}
const withValidation = { ...errors, 422: errorRef('ValidationError') }
const notFound = { 404: errorRef('NotFound') }
const deleted = envelope({ type: 'object', properties: { deleted: { type: 'boolean', example: true } } })
const paged = (item) => envelope({ type: 'array', items: ref(item) }, ref('PageMeta'))

const listBody = (extra) => jsonBody({
  type: 'object',
  properties: {
    page: { type: 'integer', minimum: 1, default: 1 },
    limit: {
      type: 'integer', minimum: 1, maximum: 100, default: 20,
    },
    search: { type: 'string', maxLength: 100 },
    sort: { type: 'string', example: '-created_at' },
    ...extra,
  },
}, undefined, false)

const dateProp = (example) => ({ type: 'string', format: 'date', example })

module.exports = {
  '/p2h/get': {
    post: {
      tags: ['P2H'],
      summary: 'Daftar P2H',
      description: 'Semua P2H (tanpa yang sudah dihapus). Urut: `inspection_date` (default, menurun), `checked_at`, `status`, `created_at`; awalan `-` = menurun. `search` mencari plat, nama atau kode driver.',
      security: secured,
      requestBody: listBody({
        unit_id: { type: 'string', format: 'uuid' },
        driver_id: { type: 'string', format: 'uuid' },
        status: { type: 'string', enum: ['layak', 'catatan', 'tidak_layak'] },
        from: dateProp('2026-11-01'),
        to: dateProp('2026-11-30'),
      }),
      responses: { 200: jsonResponse('OK', paged('AdminP2HListItem')), ...withValidation },
    },
  },
  '/p2h/{id}': {
    get: {
      tags: ['P2H'],
      summary: 'Detail P2H',
      description: 'Lengkap dengan jawaban tiap item dan foto badan.',
      security: secured,
      parameters: idPath,
      responses: { 200: jsonResponse('OK', envelope(ref('P2HInspection'))), ...withValidation, ...notFound },
    },
    put: {
      tags: ['P2H'],
      summary: 'Koreksi hasil P2H',
      description: 'Admin mengoreksi jawaban item. Status (`layak` / `catatan` / `tidak_layak`) dan `can_operate` dihitung ulang server dari definisi checklist (item kritis tidak sesuai = `tidak_layak`). Hanya item yang sudah ada di P2H ini.',
      security: secured,
      parameters: idPath,
      requestBody: jsonBody(ref('AdminP2HUpdateRequest')),
      responses: { 200: jsonResponse('OK', envelope(ref('P2HInspection'))), ...withValidation, ...notFound },
    },
    delete: {
      tags: ['P2H'],
      summary: 'Hapus P2H (soft delete)',
      description: 'Hanya admin. Baris tetap ada (jejak audit), hilang dari daftar dan detail, dan status unit hari itu kembali `belum` sehingga driver dapat membuat P2H baru.',
      security: secured,
      parameters: idPath,
      responses: { 200: jsonResponse('OK', deleted), ...withValidation, ...notFound },
    },
  },
  '/media/get': {
    post: {
      tags: ['Media'],
      summary: 'Daftar media',
      description: 'Semua foto (tanpa yang sudah dihapus). Urut: `captured_at` (default, menurun), `created_at`, `kind`. `search` mencari nama pengambil atau jenis.',
      security: secured,
      requestBody: listBody({
        kind: { type: 'string', example: 'receipt' },
        captured_by: { type: 'string', format: 'uuid' },
        from: dateProp('2026-11-01'),
        to: dateProp('2026-11-30'),
      }),
      responses: { 200: jsonResponse('OK', paged('AdminMedia')), ...withValidation },
    },
  },
  '/media/{id}': {
    get: {
      tags: ['Media'],
      summary: 'Detail media',
      description: 'Admin: semua foto. Driver: hanya foto miliknya (selain itu 404).',
      security: secured,
      parameters: idPath,
      responses: {
        200: jsonResponse('OK', envelope(ref('AdminMedia'))),
        401: errors[401],
        422: errorRef('ValidationError'),
        ...notFound,
      },
    },
    delete: {
      tags: ['Media'],
      summary: 'Hapus media (soft delete)',
      description: 'Hanya admin. Ditolak (409 `CONFLICT`, `details.reason = masih_dipakai`) jika foto masih dipakai P2H, DO, odometer, atau biaya.',
      security: secured,
      parameters: idPath,
      responses: {
        200: jsonResponse('OK', deleted),
        409: jsonResponse('Foto masih dipakai data lain', ref('Error')),
        ...withValidation,
        ...notFound,
      },
    },
  },
}
