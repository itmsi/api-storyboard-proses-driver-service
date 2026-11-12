const {
  ref, envelope, jsonResponse, jsonBody, errorRef, secured,
} = require('../helpers')

const arr = (items) => ({ type: 'array', items })
const idPath = [{
  name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' }
}]

// Parameter daftar standar: ?page=&limit=&search=&sort=
const listParams = (sortValues, searchHint) => [
  { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1, default: 1 } },
  {
    name: 'limit',
    in: 'query',
    schema: {
      type: 'integer', minimum: 1, maximum: 100, default: 20
    },
  },
  {
    name: 'search', in: 'query', description: searchHint, schema: { type: 'string', maxLength: 100 }
  },
  {
    name: 'sort',
    in: 'query',
    description: `Kolom urut: ${sortValues.join(', ')}. Awalan \`-\` = menurun (mis. \`-created_at\`). Nilai lain diabaikan.`,
    schema: { type: 'string', example: sortValues[0] },
  },
  { name: 'status', in: 'query', schema: { type: 'string', enum: ['active', 'suspended'] } },
  {
    name: 'role_id', in: 'query', description: 'Filter berdasarkan role', schema: { type: 'string', format: 'uuid' }
  },
]

const adminErrors = {
  401: jsonResponse('Token tidak ada / tidak valid / akun admin dinonaktifkan', ref('Error')),
  403: jsonResponse('Bukan token admin', ref('Error')),
  429: errorRef('RateLimited'),
}
const withValidation = { ...adminErrors, 422: errorRef('ValidationError') }
const notFound = { 404: errorRef('NotFound') }

const paged = (item) => envelope(arr(ref(item)), ref('PageMeta'))

module.exports = {
  // ===================== Driver =====================
  '/drivers': {
    get: {
      tags: ['Pengguna'],
      summary: 'Daftar driver',
      security: secured,
      parameters: listParams(['name', 'code', 'created_at', 'last_login_at'], 'Cari nama, kode, atau No. HP (sebagian)'),
      responses: {
        200: jsonResponse('OK', paged('AdminDriver'), '15-accounts/GET.drivers.response.json'),
        ...withValidation,
      },
    },
    post: {
      tags: ['Pengguna'],
      summary: 'Buat akun driver',
      description: 'Membuat login + profil driver dalam satu langkah. Kode driver otomatis (`DRV-0001`, …) jika `code` kosong. '
        + 'Jika `password` kosong, dibuatkan password sementara dan **dikembalikan sekali** di `initial_password`. '
        + 'Driver langsung bisa login di aplikasi dengan kode atau No. HP.',
      security: secured,
      requestBody: jsonBody(ref('AdminDriverCreate'), '15-accounts/POST.drivers.request.json'),
      responses: {
        201: jsonResponse('Dibuat', envelope(ref('AdminDriverDetail')), '15-accounts/POST.drivers.response.json'),
        ...withValidation,
      },
    },
  },
  '/drivers/{id}': {
    get: {
      tags: ['Pengguna'],
      summary: 'Detail driver',
      description: 'Termasuk DO yang sedang berjalan (`active_do`) dan jumlah gagal login.',
      security: secured,
      parameters: idPath,
      responses: { 200: jsonResponse('OK', envelope(ref('AdminDriverDetail'))), ...withValidation, ...notFound },
    },
    put: {
      tags: ['Pengguna'],
      summary: 'Ubah data driver',
      description: '`status=suspended` mencabut semua sesi driver dan menolak login berikutnya (403). Isi minimal satu field.',
      security: secured,
      parameters: idPath,
      requestBody: jsonBody(ref('AdminDriverUpdate')),
      responses: { 200: jsonResponse('OK', envelope(ref('AdminDriverDetail'))), ...withValidation, ...notFound },
    },
    delete: {
      tags: ['Pengguna'],
      summary: 'Hapus driver (soft delete)',
      description: 'Ditolak 409 `INVALID_STATE` jika driver masih punya DO berjalan. Data lama tetap ada; kode driver yang sudah dihapus tidak dipakai ulang.',
      security: secured,
      parameters: idPath,
      responses: {
        200: jsonResponse('OK', envelope({ type: 'object', properties: { deleted: { type: 'boolean', example: true } } })),
        409: jsonResponse('Masih punya DO berjalan', ref('Error')),
        ...withValidation,
        ...notFound,
      },
    },
  },
  '/drivers/{id}/reset-password': {
    post: {
      tags: ['Pengguna'],
      summary: 'Reset password driver',
      description: 'Semua sesi driver habis dan akun dibuka kuncinya. Tanpa `password` dibuatkan password sementara (dikembalikan sekali).',
      security: secured,
      parameters: idPath,
      requestBody: jsonBody(ref('PasswordResetRequest'), undefined, false),
      responses: { 200: jsonResponse('OK', envelope(ref('PasswordResetResponse'))), ...withValidation, ...notFound },
    },
  },
  '/drivers/{id}/unlock': {
    post: {
      tags: ['Pengguna'],
      summary: 'Buka kunci akun driver',
      description: 'Untuk akun yang terkunci sementara karena salah password berkali-kali.',
      security: secured,
      parameters: idPath,
      responses: { 200: jsonResponse('OK', envelope(ref('AdminDriverDetail'))), ...withValidation, ...notFound },
    },
  },

  // ===================== Akun admin =====================
  '/users': {
    get: {
      tags: ['Pengguna'],
      summary: 'Daftar akun admin perusahaan',
      security: secured,
      parameters: listParams(['name', 'username', 'created_at', 'last_login_at'], 'Cari nama, username, atau email (sebagian)'),
      responses: { 200: jsonResponse('OK', paged('AdminUser')), ...withValidation },
    },
    post: {
      tags: ['Pengguna'],
      summary: 'Buat akun admin',
      description: 'Username dan email unik (tidak membedakan huruf besar/kecil). Tanpa `password` dibuatkan password sementara (dikembalikan sekali).',
      security: secured,
      requestBody: jsonBody(ref('AdminUserCreate')),
      responses: { 201: jsonResponse('Dibuat', envelope(ref('AdminUser'))), ...withValidation },
    },
  },
  '/users/{id}': {
    get: {
      tags: ['Pengguna'],
      summary: 'Detail akun admin',
      security: secured,
      parameters: idPath,
      responses: { 200: jsonResponse('OK', envelope(ref('AdminUser'))), ...withValidation, ...notFound },
    },
    put: {
      tags: ['Pengguna'],
      summary: 'Ubah akun admin',
      description: 'Menonaktifkan akun mencabut semua sesinya dan berlaku seketika (token yang belum kedaluwarsa pun ditolak). '
        + 'Tidak bisa menonaktifkan diri sendiri (409 `CONFLICT`).',
      security: secured,
      parameters: idPath,
      requestBody: jsonBody(ref('AdminUserUpdate')),
      responses: {
        200: jsonResponse('OK', envelope(ref('AdminUser'))),
        409: jsonResponse('Akun sendiri / admin aktif terakhir', ref('Error')),
        ...withValidation,
        ...notFound,
      },
    },
    delete: {
      tags: ['Pengguna'],
      summary: 'Hapus akun admin (soft delete)',
      description: 'Tidak bisa menghapus diri sendiri. Username dan email boleh dipakai lagi setelah dihapus.',
      security: secured,
      parameters: idPath,
      responses: {
        200: jsonResponse('OK', envelope({ type: 'object', properties: { deleted: { type: 'boolean', example: true } } })),
        409: jsonResponse('Akun sendiri / admin aktif terakhir', ref('Error')),
        ...withValidation,
        ...notFound,
      },
    },
  },
  '/users/{id}/reset-password': {
    post: {
      tags: ['Pengguna'],
      summary: 'Reset password akun admin',
      description: 'Sesi akun itu dicabut (kecuali mereset akun sendiri). Tanpa `password` dibuatkan password sementara (dikembalikan sekali).',
      security: secured,
      parameters: idPath,
      requestBody: jsonBody(ref('PasswordResetRequest'), undefined, false),
      responses: { 200: jsonResponse('OK', envelope(ref('PasswordResetResponse'))), ...withValidation, ...notFound },
    },
  },
}
