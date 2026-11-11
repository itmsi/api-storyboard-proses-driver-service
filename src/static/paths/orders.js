const {
  ref, envelope, jsonResponse, jsonBody, errorRef, secured,
} = require('../helpers')

// Operasi admin untuk DO dan penugasan unit. Path /delivery-orders dan /delivery-orders/{id} berbagi dengan
// operasi driver (paths/delivery-orders.js); keduanya digabung per metode di static/index.js.

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
const arr = (items) => ({ type: 'array', items })
const paged = (item) => envelope(arr(ref(item)), ref('PageMeta'))

module.exports = {
  '/delivery-orders': {
    post: {
      tags: ['Admin - Delivery Order'],
      summary: 'Buat dan tugaskan DO (admin)',
      description: [
        'Nomor DO otomatis (`DO-0001`, …). Alamat asal dan tujuan **disalin** ke DO, jadi mengubah lokasi master tidak mengubah DO.',
        '`customer_id` boleh dikosongkan (diturunkan dari lokasi tujuan). Driver harus aktif dan unit harus berstatus `active`.',
        'Status awal `assigned`; DO langsung muncul di aplikasi driver. Driver baru bisa menerimanya setelah unit hari itu di-P2H (butuh penugasan unit, lihat `/unit-assignments`).',
      ].join('\n'),
      security: secured,
      requestBody: jsonBody(ref('AdminDeliveryOrderCreate')),
      responses: { 201: jsonResponse('Dibuat', envelope(ref('AdminDeliveryOrderDetail'))), ...withValidation },
    },
  },
  '/delivery-orders/{id}': {
    put: {
      tags: ['Admin - Delivery Order'],
      summary: 'Ubah DO (admin)',
      description: [
        'Hanya saat DO masih `assigned` (belum diterima driver). Kirim hanya field yang ingin diubah; `cargo` juga boleh sebagian.',
        'Sesudah diterima, data DO adalah bukti kerja driver: koreksinya lewat pembatalan lalu pembuatan DO baru (409 `INVALID_STATE`).',
        'DO selesai: 409 `DO_LOCKED`. DO dibatalkan: 409 `DO_CANCELLED`.',
      ].join('\n'),
      security: secured,
      parameters: idPath,
      requestBody: jsonBody(ref('AdminDeliveryOrderUpdate')),
      responses: {
        200: jsonResponse('OK', envelope(ref('AdminDeliveryOrderDetail'))),
        409: jsonResponse('Sudah diterima / selesai / dibatalkan', ref('Error')),
        ...withValidation,
        ...notFound,
      },
    },
  },
  '/delivery-orders/{id}/cancel': {
    post: {
      tags: ['Admin - Delivery Order'],
      summary: 'Batalkan DO (admin)',
      description: [
        'Dari status mana pun selain `completed`. Foto, biaya, dan jejak yang sudah ada tidak dihapus.',
        'Di aplikasi driver DO itu hilang dari layar Berjalan dan DO ditugaskan, dan langkah yang masih dikirim (termasuk lewat sync) dijawab 409 `DO_CANCELLED`.',
        'Membatalkan DO yang sudah dibatalkan: 409 `INVALID_STATE`; DO selesai: 409 `DO_LOCKED`.',
      ].join('\n'),
      security: secured,
      parameters: idPath,
      requestBody: jsonBody(ref('CancelDeliveryOrderRequest')),
      responses: {
        200: jsonResponse('OK', envelope(ref('AdminDeliveryOrderDetail'))),
        409: jsonResponse('Sudah dibatalkan / selesai', ref('Error')),
        ...withValidation,
        ...notFound,
      },
    },
  },

  // ===================== Penugasan unit harian =====================
  '/unit-assignments': {
    get: {
      tags: ['Admin - Penugasan Unit'],
      summary: 'Daftar penugasan unit pada satu tanggal',
      description: 'Tanpa `date`: hari ini. Satu driver satu unit per hari; satu unit boleh dipakai beberapa driver di hari yang sama.',
      security: secured,
      parameters: [
        { name: 'date', in: 'query', schema: { type: 'string', format: 'date', example: '2026-11-05' } },
        { name: 'driver_id', in: 'query', schema: { type: 'string', format: 'uuid' } },
        { name: 'unit_id', in: 'query', schema: { type: 'string', format: 'uuid' } },
        {
          name: 'search', in: 'query', description: 'Cari nama/kode driver atau plat unit', schema: { type: 'string' }
        },
        { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1, default: 1 } },
        {
          name: 'limit',
          in: 'query',
          schema: {
            type: 'integer', minimum: 1, maximum: 100, default: 20
          },
        },
        {
          name: 'sort', in: 'query', description: 'driver, plat (`plate`), created_at; awalan `-` = menurun', schema: { type: 'string', example: 'driver' }
        },
      ],
      responses: { 200: jsonResponse('OK', paged('UnitAssignment')), ...withValidation },
    },
    put: {
      tags: ['Admin - Penugasan Unit'],
      summary: 'Tugaskan unit ke driver (buat atau ganti)',
      description: [
        'Membuat penugasan (201), atau mengganti unit penugasan yang sudah ada untuk driver dan tanggal yang sama (200). Memanggil ulang dengan data yang sama aman (200).',
        'Penugasan hari ini diperlukan driver untuk membuat P2H di unit itu.',
        'Ditolak 422: tanggal sebelum hari ini, driver/unit tidak ada atau tidak aktif. Ditolak 409 `CONFLICT` (`details.reason = sudah_bekerja`) jika penugasan lama yang akan diganti sudah dipakai: ada P2H di unit itu pada tanggal tsb, atau driver sedang mengerjakan DO dengan unit itu.',
      ].join('\n'),
      security: secured,
      requestBody: jsonBody(ref('UnitAssignmentRequest')),
      responses: {
        200: jsonResponse('Sudah ada / diganti', envelope(ref('UnitAssignment'))),
        201: jsonResponse('Dibuat', envelope(ref('UnitAssignment'))),
        409: jsonResponse('Driver sudah mulai bekerja dengan unit sebelumnya', ref('Error')),
        ...withValidation,
      },
    },
  },
  '/unit-assignments/{id}': {
    get: {
      tags: ['Admin - Penugasan Unit'],
      summary: 'Detail penugasan unit',
      security: secured,
      parameters: idPath,
      responses: { 200: jsonResponse('OK', envelope(ref('UnitAssignment'))), ...withValidation, ...notFound },
    },
    delete: {
      tags: ['Admin - Penugasan Unit'],
      summary: 'Cabut penugasan unit',
      description: 'Ditolak 409 `CONFLICT` jika driver sudah mulai bekerja dengan unit itu (P2H sudah dibuat atau DO sedang berjalan).',
      security: secured,
      parameters: idPath,
      responses: {
        200: jsonResponse('OK', envelope({ type: 'object', properties: { deleted: { type: 'boolean', example: true } } })),
        409: jsonResponse('Driver sudah mulai bekerja', ref('Error')),
        ...withValidation,
        ...notFound,
      },
    },
  },
}
