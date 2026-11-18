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
        'Nomor DO otomatis: `document_prefix` dari pengaturan (`PUT /settings`, default `DO-`) + `document_number` auto increment (min. 4 digit), mis. `DO-0145`; hasilnya di `no`. Alamat asal dan tujuan **disalin** ke DO, jadi mengubah lokasi master tidak mengubah DO.',
        '`customer_id` boleh dikosongkan (diturunkan dari lokasi tujuan). Driver harus aktif dan unit harus berstatus `active`.',
        '`customer_reference_no` opsional: nomor referensi dari customer (mis. no PO), teks bebas maks. 100 karakter; ikut dicari lewat `search` di daftar DO.',
        'Status awal `assigned`; DO langsung muncul di aplikasi driver.',
        'Muatan opsional: `cargo_type` (jenis, mis. `Container`) dan `cargo_details` berisi rincian bebas `[{ label, value }]` (maks. 50), mis. no container, no seal, keterangan.',
        '**Unit driver pada tanggal itu mengikuti DO ini** (tanpa penugasan terpisah): driver langsung bisa P2H di unit DO untuk tanggal `planned_load_at` (WIB; tanpa rencana muat = hari ini). Hasilnya ada di `unit_assignment` (`work_date`, `source`: `default` = driver bawaan unit, `override` = driver/unit pengganti); detail DO juga selalu memuatnya. Bila tanggal muat sudah lewat, bentrok tidak diperiksa. DO yang sudah diterima dan masih berjalan dari tanggal sebelumnya tetap menahan unitnya.',
        '**Satu driver satu unit per tanggal** (tanggal `planned_load_at` WIB; tanpa rencana muat = tanggal penugasan): driver yang sudah punya DO `assigned`/berjalan/selesai dengan unit **berbeda** pada tanggal itu ditolak 409 `CONFLICT` reason `driver_beda_unit_tanggal_sama` (`details.conflicting_orders`, `can_hold`). Unit sama = boleh. Bila DO lama masih `assigned`, ubah dulu ke `onhold` (`POST /delivery-orders/{id}/hold`), lalu DO baru bisa di-assign. DO `onhold`/`cancelled` tidak dihitung.',
        'Bentrok = DO **tidak dibuat** (409 `CONFLICT`): `driver_beda_unit_tanggal_sama` (lihat di atas) atau `unit_sudah_ditugaskan` (unit itu sudah dipegang DO driver lain pada tanggal itu; `details.order` dan `details.driver` = pemegangnya).',
      ].join('\n'),
      security: secured,
      requestBody: jsonBody(ref('AdminDeliveryOrderCreate')),
      responses: {
        201: jsonResponse('Dibuat', envelope(ref('AdminDeliveryOrderDetail'))),
        409: jsonResponse('Bentrok (`driver_beda_unit_tanggal_sama` / `unit_sudah_ditugaskan`)', ref('Error'), {
          'Driver sudah punya DO dengan unit lain di tanggal yang sama': '05-delivery-orders/POST.delivery-orders.error.driver-beda-unit.json',
        }),
        ...withValidation,
      },
    },
  },
  '/delivery-orders/{id}': {
    put: {
      tags: ['Delivery Order'],
      summary: 'Ubah DO (admin)',
      description: [
        'Hanya saat DO masih `assigned` (belum diterima driver). DO `onhold` harus dilanjutkan dulu (resume). Kirim hanya field yang ingin diubah. `cargo_details` yang dikirim mengganti seluruh rincian lama; `null` atau `[]` mengosongkannya.',
        'Sesudah diterima, data DO adalah bukti kerja driver: koreksinya lewat pembatalan lalu pembuatan DO baru (409 `INVALID_STATE`).',
        'DO selesai: 409 `DO_LOCKED`. DO dibatalkan: 409 `DO_CANCELLED`.',
        'Bila `driver_id`, `unit_id`, atau `planned_load_at` berubah, kombinasi barunya diperiksa (respons memuat `unit_assignment`). Bentrok = 409 seperti pada pembuatan DO (termasuk `driver_beda_unit_tanggal_sama`) dan DO tidak berubah.',
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
  '/delivery-orders/{id}/hold': {
    post: {
      tags: ['Delivery Order'],
      summary: 'Tahan DO / onhold (admin)',
      description: [
        'Hanya dari `assigned` (belum diterima driver) → `onhold`. `reason` opsional.',
        'DO onhold hilang dari aplikasi driver, tidak bisa diterima, dan **tidak lagi memakai hari kerja driver**: driver yang sama boleh mendapat DO lain dengan unit berbeda pada tanggal yang sama.',
        'Penugasan unit harian milik DO ini dipindah ke unit DO baru saat DO baru dibuat (bila tidak dipakai DO lain).',
        'Sudah onhold / sudah diterima driver: 409 `INVALID_STATE`. DO selesai: 409 `DO_LOCKED`. DO dibatalkan: 409 `DO_CANCELLED`.',
      ].join('\n'),
      security: secured,
      parameters: idPath,
      requestBody: jsonBody(ref('HoldDeliveryOrderRequest')),
      responses: {
        200: jsonResponse('OK', envelope(ref('AdminDeliveryOrderDetail'))),
        409: jsonResponse('Bukan assigned / selesai / dibatalkan', ref('Error')),
        ...withValidation,
        ...notFound,
      },
    },
  },
  '/delivery-orders/{id}/resume': {
    post: {
      tags: ['Delivery Order'],
      summary: 'Lanjutkan DO onhold (admin)',
      description: [
        '`onhold` → `assigned`; DO muncul lagi di aplikasi driver.',
        'Aturan satu driver satu unit per tanggal diperiksa lagi: bila driver sudah punya DO lain dengan unit berbeda pada tanggal itu, 409 `CONFLICT` `driver_beda_unit_tanggal_sama` (onhold-kan DO lain itu dulu).',
        'Unit tanggal DO diperiksa lagi (respons memuat `unit_assignment`). Bukan onhold: 409 `INVALID_STATE`.',
      ].join('\n'),
      security: secured,
      parameters: idPath,
      responses: {
        200: jsonResponse('OK', envelope(ref('AdminDeliveryOrderDetail'))),
        409: jsonResponse('Bukan onhold / bentrok unit', ref('Error')),
        ...errors,
        ...notFound,
      },
    },
  },
  '/delivery-orders/{id}/cancel': {
    post: {
      tags: ['Delivery Order'],
      summary: 'Batalkan DO (admin)',
      description: [
        'Dari status mana pun selain `completed` (termasuk `onhold`). Foto, biaya, dan jejak yang sudah ada tidak dihapus.',
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
