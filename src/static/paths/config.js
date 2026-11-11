const {
  ref, envelope, jsonResponse, jsonBody, errorRef, secured,
} = require('../helpers')

// Konfigurasi perusahaan oleh admin: checklist P2H, kategori biaya, pengaturan aplikasi.
// Setiap perubahan menaikkan config_version, jadi aplikasi driver yang membandingkan versi di bootstrap mengambil ulang GET /config.

const codePath = (what) => [{
  name: 'code', in: 'path', required: true, description: `Kode ${what} (huruf kecil)`, schema: { type: 'string', example: 'ban' },
}]

const errors = {
  401: jsonResponse('Token tidak ada / tidak valid / akun admin dinonaktifkan', ref('Error')),
  403: jsonResponse('Bukan token admin', ref('Error')),
  429: errorRef('RateLimited'),
}
const withValidation = { ...errors, 422: errorRef('ValidationError') }
const notFound = { 404: errorRef('NotFound') }
const paged = (item) => envelope({ type: 'array', items: ref(item) }, ref('PageMeta'))

const listParams = (sortHint) => [
  { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1, default: 1 } },
  {
    name: 'limit',
    in: 'query',
    schema: {
      type: 'integer', minimum: 1, maximum: 100, default: 20
    },
  },
  {
    name: 'search', in: 'query', description: 'Cari kode atau nama', schema: { type: 'string' }
  },
  {
    name: 'sort', in: 'query', description: sortHint, schema: { type: 'string', example: 'sort_order' }
  },
  {
    name: 'is_active', in: 'query', description: 'true = hanya aktif, false = hanya nonaktif, kosong = semua', schema: { type: 'boolean' }
  },
]

module.exports = {
  '/p2h-items': {
    get: {
      tags: ['Admin - Konfigurasi'],
      summary: 'Daftar item checklist P2H',
      security: secured,
      parameters: listParams('sort_order (default), label, code, created_at; awalan `-` = menurun'),
      responses: { 200: jsonResponse('OK', paged('AdminP2HItem')), ...withValidation },
    },
    post: {
      tags: ['Admin - Konfigurasi'],
      summary: 'Tambah item checklist P2H',
      description: 'Berlaku untuk P2H yang dibuat sesudahnya: semua item aktif wajib dijawab driver. Menaikkan `config_version`.',
      security: secured,
      requestBody: jsonBody(ref('AdminP2HItemCreate')),
      responses: { 201: jsonResponse('Dibuat', envelope(ref('AdminP2HItem'))), ...withValidation },
    },
  },
  '/p2h-items/{code}': {
    get: {
      tags: ['Admin - Konfigurasi'],
      summary: 'Detail item checklist P2H',
      security: secured,
      parameters: codePath('item'),
      responses: { 200: jsonResponse('OK', envelope(ref('AdminP2HItem'))), ...withValidation, ...notFound },
    },
    put: {
      tags: ['Admin - Konfigurasi'],
      summary: 'Ubah item checklist P2H',
      description: [
        'Kirim hanya field yang ingin diubah. Kode tidak bisa diubah. **Tidak ada hapus**: item dinonaktifkan lewat `is_active: false` (jawaban P2H lama tetap utuh).',
        'Item aktif terakhir tidak bisa dinonaktifkan (409 `CONFLICT`, `details.reason = item_aktif_terakhir`). Menaikkan `config_version`.',
      ].join('\n'),
      security: secured,
      parameters: codePath('item'),
      requestBody: jsonBody(ref('AdminP2HItemUpdate')),
      responses: {
        200: jsonResponse('OK', envelope(ref('AdminP2HItem'))),
        409: jsonResponse('Item aktif terakhir', ref('Error')),
        ...withValidation,
        ...notFound,
      },
    },
  },

  '/expense-categories': {
    get: {
      tags: ['Admin - Konfigurasi'],
      summary: 'Daftar kategori biaya',
      security: secured,
      parameters: listParams('sort_order (default), label, code, created_at; awalan `-` = menurun'),
      responses: { 200: jsonResponse('OK', paged('AdminExpenseCategory')), ...withValidation },
    },
    post: {
      tags: ['Admin - Konfigurasi'],
      summary: 'Tambah kategori biaya',
      description: 'Kategori aktif langsung muncul di `expense_categories` pada `GET /config` driver. Menaikkan `config_version`.',
      security: secured,
      requestBody: jsonBody(ref('AdminExpenseCategoryCreate')),
      responses: { 201: jsonResponse('Dibuat', envelope(ref('AdminExpenseCategory'))), ...withValidation },
    },
  },
  '/expense-categories/{code}': {
    get: {
      tags: ['Admin - Konfigurasi'],
      summary: 'Detail kategori biaya',
      security: secured,
      parameters: codePath('kategori'),
      responses: { 200: jsonResponse('OK', envelope(ref('AdminExpenseCategory'))), ...withValidation, ...notFound },
    },
    put: {
      tags: ['Admin - Konfigurasi'],
      summary: 'Ubah kategori biaya',
      description: [
        'Kirim hanya field yang ingin diubah. Kode tidak bisa diubah. **Tidak ada hapus**: nonaktifkan lewat `is_active: false`.',
        '409 `CONFLICT`: `input` diubah padahal sudah ada biaya dengan kategori ini (`details.expense_count`), atau menonaktifkan kategori aktif terakhir. Menaikkan `config_version`.',
      ].join('\n'),
      security: secured,
      parameters: codePath('kategori'),
      requestBody: jsonBody(ref('AdminExpenseCategoryUpdate')),
      responses: {
        200: jsonResponse('OK', envelope(ref('AdminExpenseCategory'))),
        409: jsonResponse('Kategori sudah dipakai / kategori aktif terakhir', ref('Error')),
        ...withValidation,
        ...notFound,
      },
    },
  },

  '/settings': {
    get: {
      tags: ['Admin - Konfigurasi'],
      summary: 'Pengaturan aplikasi yang berlaku',
      description: 'Nilai bawaan ditambah perubahan perusahaan ini. Kategori biaya dikelola lewat `/expense-categories`, checklist P2H lewat `/p2h-items`.',
      security: secured,
      responses: { 200: jsonResponse('OK', envelope(ref('AdminSettings'))), ...errors },
    },
    put: {
      tags: ['Admin - Konfigurasi'],
      summary: 'Ubah pengaturan aplikasi',
      description: [
        'Kirim hanya yang ingin diubah; tiap kelompok digabung dengan nilai sekarang (mis. `modules: { receipt_ocr: false }` tidak mengubah flag lain). Kunci yang tidak dikenal ditolak 422.',
        'Aturan antar-field dicek pada hasil gabungan: `min` foto tidak boleh melebihi `max`, bahasa bawaan harus ada di daftar bahasa, minimal satu sisi foto badan P2H.',
        'Berlaku langsung di server: jumlah foto muat/bongkar/surat jalan, sisi foto P2H, jam berlaku P2H, dan kewajiban alasan koreksi. Menaikkan `config_version`. Jika ada yang gagal validasi, tidak ada yang berubah.',
      ].join('\n'),
      security: secured,
      requestBody: jsonBody(ref('AdminSettingsUpdate')),
      responses: { 200: jsonResponse('OK', envelope(ref('AdminSettings'))), ...withValidation },
    },
  },
}
