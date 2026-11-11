const {
  ref, envelope, jsonResponse, jsonBody, errorRef, secured,
} = require('../helpers')

// Role dan hak akses admin. Tiap role = matriks hak per modul; tiap user admin punya satu role. Daftar memakai POST + body.
const TAG = 'Pengguna'
const idPath = [{
  name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' }
}]
const errors = {
  401: jsonResponse('Token tidak ada / tidak valid / akun admin dinonaktifkan', ref('Error')),
  403: jsonResponse('Bukan token admin, hak modul "roles" tidak ada, atau melebihi hak sendiri (`details.required` / `details.reason = melebihi_hak_sendiri`)', ref('Error')),
  429: errorRef('RateLimited'),
}
const withValidation = { ...errors, 422: errorRef('ValidationError') }
const notFound = { 404: errorRef('NotFound') }
const deleted = envelope({ type: 'object', properties: { deleted: { type: 'boolean', example: true } } })
const paged = (item) => envelope({ type: 'array', items: ref(item) }, ref('PageMeta'))

module.exports = {
  '/roles/catalog': {
    get: {
      tags: [TAG],
      summary: 'Katalog modul dan aksi hak akses',
      description: 'Daftar modul dan aksi (`read`, `create`, `update`, `delete`) yang bisa diberikan, untuk menggambar matriks hak di layar. Aksi `update` mencakup tindakan seperti batalkan DO/biaya, tandai lunas, reset password, dan minta P2H ulang.',
      security: secured,
      responses: { 200: jsonResponse('OK', envelope(ref('PermissionCatalog'))), ...errors },
    },
  },
  '/roles/get': {
    post: {
      tags: [TAG],
      summary: 'Daftar role',
      description: 'Urut: `name` (default), `code`, `created_at`. Filter: `is_active`, `search` (nama atau kode).',
      security: secured,
      requestBody: jsonBody({
        type: 'object',
        properties: {
          page: { type: 'integer', minimum: 1, default: 1 },
          limit: {
            type: 'integer', minimum: 1, maximum: 100, default: 20,
          },
          search: { type: 'string' },
          sort: { type: 'string', example: 'name' },
          is_active: { type: 'boolean' },
        },
      }, undefined, false),
      responses: { 200: jsonResponse('OK', paged('AdminRole')), ...withValidation },
    },
  },
  '/roles': {
    post: {
      tags: [TAG],
      summary: 'Buat role',
      description: 'Admin hanya boleh memberi hak yang dimilikinya sendiri (403 `melebihi_hak_sendiri`). Hak diubah langsung berlaku untuk semua akun pemakai role, tanpa login ulang.',
      security: secured,
      requestBody: jsonBody(ref('AdminRoleCreate')),
      responses: { 201: jsonResponse('Dibuat', envelope(ref('AdminRole'))), ...withValidation },
    },
  },
  '/roles/{id}': {
    get: {
      tags: [TAG],
      summary: 'Detail role',
      security: secured,
      parameters: idPath,
      responses: { 200: jsonResponse('OK', envelope(ref('AdminRole'))), ...withValidation, ...notFound },
    },
    put: {
      tags: [TAG],
      summary: 'Ubah role',
      description: 'Kirim hanya field yang ingin diubah. Role bawaan Administrator tidak bisa diubah (409 `role_sistem`).',
      security: secured,
      parameters: idPath,
      requestBody: jsonBody(ref('AdminRoleUpdate')),
      responses: {
        200: jsonResponse('OK', envelope(ref('AdminRole'))),
        409: jsonResponse('Role bawaan', ref('Error')),
        ...withValidation,
        ...notFound,
      },
    },
    delete: {
      tags: [TAG],
      summary: 'Hapus role (soft delete)',
      description: 'Ditolak (409) jika role bawaan (`role_sistem`) atau masih dipakai akun (`masih_dipakai`, `details.user_count`).',
      security: secured,
      parameters: idPath,
      responses: {
        200: jsonResponse('OK', deleted),
        409: jsonResponse('Role bawaan / masih dipakai', ref('Error')),
        ...withValidation,
        ...notFound,
      },
    },
  },
}
