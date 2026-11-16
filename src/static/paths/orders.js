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

module.exports = {
  '/delivery-orders': {
    post: {
      tags: ['Delivery Order'],
      summary: 'Buat dan tugaskan DO (admin)',
      description: [
        'Nomor DO otomatis (`DO-0001`, …). Alamat asal dan tujuan **disalin** ke DO, jadi mengubah lokasi master tidak mengubah DO.',
        '`customer_id` boleh dikosongkan (diturunkan dari lokasi tujuan). Driver harus aktif dan unit harus berstatus `active`.',
        'Status awal `assigned`; DO langsung muncul di aplikasi driver.',
        '**Penugasan unit harian disiapkan sekalian** untuk tanggal `planned_load_at` (WIB; tanpa rencana muat = hari ini), sehingga driver langsung bisa P2H di unit itu. Hasilnya ada di `unit_assignment` (`created` true = dibuat otomatis, false = sudah ada). Bila tanggal muat sudah lewat, penugasan tidak disiapkan (`unit_assignment: null`).',
        'Bentrok = DO **tidak dibuat** (409 `CONFLICT`): `penugasan_beda_unit` (driver sudah punya unit lain pada tanggal itu; gunakan unit yang sama atau ganti driver/unit DO) atau `unit_sudah_ditugaskan` (unit itu dipegang driver lain pada tanggal itu).',
      ].join('\n'),
      security: secured,
      requestBody: jsonBody(ref('AdminDeliveryOrderCreate')),
      responses: {
        201: jsonResponse('Dibuat', envelope(ref('AdminDeliveryOrderDetail'))),
        409: jsonResponse('Penugasan unit harian bentrok (`penugasan_beda_unit` / `unit_sudah_ditugaskan`)', ref('Error')),
        ...withValidation,
      },
    },
  },
  '/delivery-orders/{id}': {
    put: {
      tags: ['Delivery Order'],
      summary: 'Ubah DO (admin)',
      description: [
        'Hanya saat DO masih `assigned` (belum diterima driver). Kirim hanya field yang ingin diubah; `cargo` juga boleh sebagian.',
        'Sesudah diterima, data DO adalah bukti kerja driver: koreksinya lewat pembatalan lalu pembuatan DO baru (409 `INVALID_STATE`).',
        'DO selesai: 409 `DO_LOCKED`. DO dibatalkan: 409 `DO_CANCELLED`.',
        'Bila `driver_id`, `unit_id`, atau `planned_load_at` berubah, penugasan unit harian untuk kombinasi barunya disiapkan (respons memuat `unit_assignment`); penugasan lama dibiarkan. Bentrok = 409 seperti pada pembuatan DO dan DO tidak berubah.',
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
      tags: ['Delivery Order'],
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

}
