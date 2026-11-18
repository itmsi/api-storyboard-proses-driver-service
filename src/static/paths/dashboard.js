const {
  ref, envelope, jsonResponse, jsonBody, errorRef, secured,
} = require('../helpers')

const errors = {
  401: jsonResponse('Token tidak ada / tidak valid / akun admin dinonaktifkan', ref('Error')),
  403: jsonResponse('Bukan token admin, atau role tidak punya hak dashboard:read', ref('Error')),
  422: errorRef('ValidationError'),
  429: errorRef('RateLimited'),
}

// Contoh request: payload default (= body kosong, hari ini) lebih dulu
const REQUEST_EXAMPLES = {
  Default: {
    summary: 'Payload default (hari ini); sama dengan body kosong',
    value: {
      page: 1, limit: 20, search: '', sort: 'created_at', sort_by: 'DESC',
    },
  },
  'Rentang tanggal': {
    summary: 'Rentang start_date..end_date (mis. tombol 7 hari / 30 hari)',
    value: {
      page: 1, limit: 20, search: '0144', sort: 'created_at', sort_by: 'DESC', start_date: '2026-11-01', end_date: '2026-11-30',
    },
  },
  '7 hari terakhir': { summary: 'Hanya start_date = sampai hari ini (contoh: hari ini 2026-11-05)', value: { start_date: '2026-10-30' } },
}

const withExamples = (body) => {
  // eslint-disable-next-line no-param-reassign
  body.content['application/json'].examples = REQUEST_EXAMPLES
  return body
}

const dateProp = (description, example) => ({
  type: 'string', format: 'date', description, example,
})

module.exports = {
  '/dashboard/get': {
    post: {
      tags: ['Dashboard'],
      summary: 'Ringkasan operasional (dashboard admin)',
      description: [
        'Satu panggilan untuk seluruh layar Dashboard, dihitung untuk rentang `start_date`..`end_date` (tanggal kerja DO = jadwal muat, '
          + 'atau waktu penugasan bila tanpa jadwal; WIB). Tanpa tanggal = hari ini; hanya `start_date` = dari tanggal itu sampai hari ini; hanya `end_date` = satu hari itu. '
          + 'Rentang maksimal 366 hari. Tombol "Hari ini / 7 hari / 30 hari" cukup mengirim `start_date` (hari ini, 6 hari lalu, 29 hari lalu).',
        '',
        '- `cards`: DO hari ini (+ belum diterima), sedang berjalan (+ data antre sync), selesai (+ settlement disetujui), gagal kirim.',
        '- `do_status`: jumlah dan persen per status, dan per customer. DO batal tidak masuk total (`cancelled`).',
        '- `p2h`: unit aktif per status P2H pada `end_date` (paling lambat hari ini) dan daftar "Perlu perhatian".',
        '- `finance`: uang jalan diberikan, biaya tercatat, sisa disetor, kurang bayar, dan rekap yang menunggu persetujuan (maks. 10).',
        '- `delivery_orders`: daftar DO pada rentang. **Hanya bagian ini** yang dipengaruhi `page`, `limit`, `search` (nomor DO, barang, driver, plat, customer), '
          + '`sort` (no, planned_load_at, assigned_at, status, created_at) dan `sort_by`; `meta` = pagination daftar ini.',
        '',
        'Hak: `dashboard:read` (Administrator otomatis punya).',
      ].join('\n'),
      security: secured,
      requestBody: withExamples(jsonBody({
        type: 'object',
        properties: {
          page: { type: 'integer', minimum: 1, default: 1 },
          limit: {
            type: 'integer', minimum: 1, maximum: 100, default: 20,
          },
          search: { type: 'string', maxLength: 100, description: 'Cari di daftar delivery_orders: nomor DO, barang, driver, plat, customer' },
          sort: { type: 'string', description: 'Kolom urut daftar delivery_orders: no, planned_load_at, assigned_at, status, created_at (default created_at)' },
          start_date: dateProp('Awal rentang (WIB). Default = end_date, atau hari ini', '2026-11-01'),
          end_date: dateProp('Akhir rentang (WIB). Default = hari ini (atau start_date bila start_date di masa depan)', '2026-11-30'),
        },
      }, undefined, false)),
      responses: {
        200: jsonResponse('OK', envelope(ref('Dashboard'), ref('PageMeta')), '16-dashboard/POST.dashboard.get.response.json'),
        ...errors,
      },
    },
  },
}
