const {
  ref, envelope, jsonResponse, jsonBody, errorRef, secured,
} = require('../helpers')

// Tindakan operasional admin: minta P2H ulang, batalkan biaya, rekap uang jalan.

const idPath = [{
  name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' }
}]
const unitPath = [{
  name: 'unitId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' }
}]

const errors = {
  401: jsonResponse('Token tidak ada / tidak valid / akun admin dinonaktifkan', ref('Error')),
  403: jsonResponse('Bukan token admin', ref('Error')),
  429: errorRef('RateLimited'),
}
const withValidation = { ...errors, 422: errorRef('ValidationError') }
const notFound = { 404: errorRef('NotFound') }

const page = [
  { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1, default: 1 } },
  {
    name: 'limit',
    in: 'query',
    schema: {
      type: 'integer', minimum: 1, maximum: 100, default: 20
    },
  },
  {
    name: 'from', in: 'query', description: 'Tanggal awal (WIB)', schema: { type: 'string', format: 'date', example: '2026-11-01' }
  },
  {
    name: 'to', in: 'query', description: 'Tanggal akhir (WIB)', schema: { type: 'string', format: 'date', example: '2026-11-30' }
  },
  { name: 'driver_id', in: 'query', schema: { type: 'string', format: 'uuid' } },
]

module.exports = {
  '/units/{unitId}/p2h/recheck': {
    post: {
      tags: ['P2H'],
      summary: 'Minta P2H ulang (admin)',
      description: [
        'Menandai P2H unit hari ini sebagai digantikan. Di aplikasi driver status unit kembali `belum` dengan `recheck_requested: true` dan data P2H sebelumnya (`previous`); '
          + 'DO yang belum diterima tidak bisa diterima (`P2H_REQUIRED`) sampai driver membuat P2H baru.',
        'Hanya P2H hari ini. Ditolak 409 `INVALID_STATE` jika unit belum punya P2H aktif hari ini, atau permintaan ulang sudah ada dan menunggu driver.',
        'Setelah driver membuat P2H baru, permintaan ulang bisa dibuat lagi.',
      ].join('\n'),
      security: secured,
      parameters: unitPath,
      requestBody: jsonBody(ref('P2HRecheckRequest')),
      responses: {
        200: jsonResponse('OK', envelope(ref('P2HRecheckResponse'))),
        409: jsonResponse('Tidak ada P2H aktif / sudah diminta ulang', ref('Error')),
        ...withValidation,
        ...notFound,
      },
    },
  },

  // ===================== Biaya =====================
  '/expenses': {
    get: {
      tags: ['Admin - Biaya'],
      summary: 'Daftar biaya perjalanan (admin)',
      description: 'Biaya semua DO, lengkap dengan bukti foto dan hasil pemeriksaan struk (`receipt.checks`). Biaya yang dibatalkan tetap tampil dengan `voided` terisi.',
      security: secured,
      parameters: [
        ...page,
        { name: 'delivery_order_id', in: 'query', schema: { type: 'string', format: 'uuid' } },
        {
          name: 'category', in: 'query', description: 'Kode kategori, mis. bbm, tol, parkir, lainnya', schema: { type: 'string' }
        },
        {
          name: 'voided', in: 'query', description: 'true = hanya yang dibatalkan, false = hanya yang berlaku, kosong = semua', schema: { type: 'boolean' }
        },
        {
          name: 'search', in: 'query', description: 'Cari nomor DO, keterangan, jenis BBM, atau driver', schema: { type: 'string' }
        },
        {
          name: 'sort', in: 'query', description: 'recorded_at (default, menurun), amount, category, created_at; awalan `-` = menurun', schema: { type: 'string', example: '-recorded_at' }
        },
      ],
      responses: { 200: jsonResponse('OK', envelope({ type: 'array', items: ref('AdminExpense') }, ref('PageMeta'))), ...withValidation },
    },
  },
  '/expenses/{id}': {
    get: {
      tags: ['Admin - Biaya'],
      summary: 'Detail biaya (admin)',
      security: secured,
      parameters: idPath,
      responses: { 200: jsonResponse('OK', envelope(ref('AdminExpense'))), ...withValidation, ...notFound },
    },
  },
  '/expenses/{id}/void': {
    post: {
      tags: ['Admin - Biaya'],
      summary: 'Batalkan biaya (admin)',
      description: [
        'Untuk biaya yang tidak sah atau salah catat. Biaya tidak dihapus (jejak tetap ada), tetapi tidak dihitung lagi: total biaya DO dihitung ulang, '
          + 'dan struk BBM yang dibatalkan bisa dikirim ulang jika memang benar.',
        'Pada DO yang sudah selesai, **rekap uang jalan ikut dihitung ulang** (jenis dan jumlah selisih bisa berpindah, mis. kurang bayar menjadi sisa disetor). '
          + 'Setelah rekap ditandai disetor/dibayar angkanya terkunci: 409 `CONFLICT` (`details.reason = rekap_sudah_lunas`).',
        'Biaya yang sudah dibatalkan: 409 `INVALID_STATE`. Kejadian dicatat di linimasa DO (`expense_voided`).',
      ].join('\n'),
      security: secured,
      parameters: idPath,
      requestBody: jsonBody(ref('VoidExpenseRequest')),
      responses: {
        200: jsonResponse('OK', envelope(ref('AdminExpense'))),
        409: jsonResponse('Sudah dibatalkan / rekap sudah lunas', ref('Error')),
        ...withValidation,
        ...notFound,
      },
    },
  },

  // ===================== Rekap uang jalan =====================
  '/settlements': {
    get: {
      tags: ['Admin - Rekap Uang Jalan'],
      summary: 'Daftar rekap uang jalan',
      description: 'Satu baris per DO selesai: selisih uang jalan dan total biaya. `meta.summary` berisi total sisa disetor, total kurang bayar, dan jumlah yang belum diselesaikan '
        + 'untuk **semua** hasil filter (bukan hanya halaman ini).',
      security: secured,
      parameters: [
        ...page,
        { name: 'type', in: 'query', schema: { type: 'string', enum: ['refund_to_company', 'payable_to_driver', 'balanced'] } },
        {
          name: 'settled', in: 'query', description: 'true = sudah disetor/dibayar, false = belum', schema: { type: 'boolean' }
        },
        {
          name: 'search', in: 'query', description: 'Cari nomor DO, driver, atau plat', schema: { type: 'string' }
        },
        {
          name: 'sort', in: 'query', description: 'completed_at (default, menurun), amount, type, do; awalan `-` = menurun', schema: { type: 'string', example: '-completed_at' }
        },
      ],
      responses: { 200: jsonResponse('OK', envelope({ type: 'array', items: ref('AdminSettlement') }, ref('SettlementListMeta'))), ...withValidation },
    },
  },
  '/settlements/{id}': {
    get: {
      tags: ['Admin - Rekap Uang Jalan'],
      summary: 'Detail rekap uang jalan',
      description: '`id` = id delivery order (satu DO punya paling banyak satu rekap, dibuat saat driver menyelesaikan DO).',
      security: secured,
      parameters: idPath,
      responses: { 200: jsonResponse('OK', envelope(ref('AdminSettlement'))), ...withValidation, ...notFound },
    },
  },
  '/settlements/{id}/settle': {
    post: {
      tags: ['Admin - Rekap Uang Jalan'],
      summary: 'Tandai sudah disetor / dibayar',
      description: [
        '`id` = id delivery order. Menandai bahwa sisa uang jalan sudah disetor ke perusahaan (`refund_to_company`) atau kekurangannya sudah dibayar ke driver (`payable_to_driver`).',
        'Sesudah itu rekap terkunci: biaya DO itu tidak bisa dibatalkan lagi. Menandai dua kali: 409 `INVALID_STATE`.',
      ].join('\n'),
      security: secured,
      parameters: idPath,
      requestBody: jsonBody(ref('SettleRequest'), undefined, false),
      responses: {
        200: jsonResponse('OK', envelope(ref('AdminSettlement'))),
        409: jsonResponse('Sudah ditandai', ref('Error')),
        ...withValidation,
        ...notFound,
      },
    },
  },
}
