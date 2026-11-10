const {
  ex, ref, envelope, jsonResponse, jsonBody, errorRef, authErrors, secured,
} = require('../helpers')

const doId = [{ $ref: '#/components/parameters/DeliveryOrderId' }]
const arr = (items) => ({ type: 'array', items })

module.exports = {
  // ===================== Delivery Order =====================
  '/delivery-orders': {
    get: {
      tags: ['Delivery Order'],
      summary: 'Daftar DO milik driver',
      description: 'Dipakai layar "DO ditugaskan" dengan `status=assigned`.',
      security: secured,
      parameters: [{
        name: 'status',
        in: 'query',
        required: false,
        schema: { type: 'string', enum: ['assigned', 'accepted', 'in_transit'], example: 'assigned' },
      }],
      responses: {
        200: jsonResponse(
          'OK',
          envelope(arr(ref('DeliveryOrder')), { type: 'object', properties: { count: { type: 'integer', example: 1 } } }),
          '05-delivery-orders/GET.delivery-orders.assigned.response.json'
        ),
        ...authErrors,
      },
    },
  },
  '/delivery-orders/active': {
    get: {
      tags: ['Delivery Order'],
      summary: 'DO yang sedang berjalan (menu Berjalan)',
      description: '`meta.pending_sync` berisi data yang tercatat di server sebagai belum lengkap tersinkron.',
      security: secured,
      responses: {
        200: jsonResponse('OK', envelope(arr(ref('ActiveDeliveryOrder')), {
          type: 'object',
          properties: {
            pending_sync: arr({
              type: 'object',
              properties: {
                type: { type: 'string', example: 'expense' },
                label: { type: 'string', example: 'Tol 54.500' },
                client_created_at: { type: 'string', format: 'date-time' },
              },
            }),
          },
        }), '11-active/GET.delivery-orders.active.response.json'),
        ...authErrors,
      },
    },
  },
  '/delivery-orders/history': {
    get: {
      tags: ['Delivery Order'],
      summary: 'Riwayat DO (menu Riwayat)',
      description: 'Pagination berbasis cursor. Kirim `cursor` dari `meta.next_cursor` untuk halaman berikutnya.',
      security: secured,
      parameters: [
        { name: 'from', in: 'query', schema: { type: 'string', format: 'date', example: '2026-11-01' } },
        { name: 'to', in: 'query', schema: { type: 'string', format: 'date', example: '2026-11-05' } },
        {
          name: 'limit',
          in: 'query',
          schema: {
            type: 'integer', minimum: 1, maximum: 50, default: 20
          },
        },
        { name: 'cursor', in: 'query', schema: { type: 'string', example: 'eyJpZCI6ImRvXzAxMzEifQ==' } },
      ],
      responses: {
        200: jsonResponse('OK', envelope(arr(ref('HistoryItem')), ref('HistoryMeta')), {
          'Halaman 1': '12-history/GET.history.page1.response.json',
          'Halaman 2 (terakhir)': '12-history/GET.history.page2.response.json',
          Kosong: '12-history/GET.history.empty.response.json',
        }),
        422: errorRef('ValidationError'),
        ...authErrors,
      },
    },
  },
  '/delivery-orders/{id}': {
    get: {
      tags: ['Delivery Order'],
      summary: 'Detail DO',
      security: secured,
      parameters: doId,
      responses: {
        200: jsonResponse('OK', envelope(ref('DeliveryOrder')), '05-delivery-orders/GET.delivery-orders.id.response.json'),
        404: errorRef('NotFound'),
        ...authErrors,
      },
    },
  },
  '/delivery-orders/{id}/accept': {
    post: {
      tags: ['Delivery Order'],
      summary: 'Terima DO',
      description: 'Syarat: unit sudah P2H hari ini dan boleh beroperasi. Konfirmasi uang jalan diterima dicatat di sini. '
        + 'Payload push DO baru: schema `PushDoAssigned`.',
      security: secured,
      parameters: doId,
      requestBody: jsonBody(ref('AcceptRequest'), '05-delivery-orders/POST.accept.request.json'),
      responses: {
        200: jsonResponse('OK', envelope(ref('AcceptResponse')), '05-delivery-orders/POST.accept.response.json'),
        404: errorRef('NotFound'),
        409: {
          description: 'P2H belum ada / status DO tidak sesuai',
          content: {
            'application/json': {
              schema: ref('Error'),
              examples: {
                P2H_REQUIRED: { value: ex('00-common/error.p2h-required.json') },
              },
            },
          },
        },
        422: errorRef('ValidationError'),
        ...authErrors,
      },
    },
  },

  // ===================== Perjalanan =====================
  '/delivery-orders/{id}/loading': {
    post: {
      tags: ['Perjalanan'],
      summary: 'Foto muatan & surat jalan',
      description: 'Jumlah foto mengikuti `photo_rules` di `/config`. Jika jumlah barang tidak sesuai DO, `quantity_note` wajib.',
      security: secured,
      parameters: doId,
      requestBody: jsonBody(ref('LoadingRequest'), {
        Sesuai: '06-loading/POST.loading.request.json',
        'Tidak sesuai DO': '06-loading/POST.loading.request.tidak-sesuai.json',
      }),
      responses: {
        201: jsonResponse('Tersimpan', envelope(ref('LoadingResponse')), '06-loading/POST.loading.response.json'),
        404: errorRef('NotFound'),
        409: errorRef('InvalidState'),
        422: errorRef('ValidationError'),
        ...authErrors,
      },
    },
  },
  '/delivery-orders/{id}/odometer': {
    post: {
      tags: ['Perjalanan'],
      summary: 'Catat odometer awal / akhir',
      description: '`type=start` setelah muat, `type=end` setelah serah terima. Jika nilai OCR dikoreksi, '
        + '`correction_reason` wajib. Nilai `effective` = koreksi jika ada, selain itu OCR.',
      security: secured,
      parameters: doId,
      requestBody: jsonBody(ref('OdometerRequest'), {
        'Awal (OCR)': '07-odometer/POST.odometer.start.request.json',
        'Awal (dikoreksi)': '07-odometer/POST.odometer.start.request.dikoreksi.json',
        Akhir: '07-odometer/POST.odometer.end.request.json',
      }),
      responses: {
        201: jsonResponse('Tersimpan', envelope(ref('OdometerResponse')), '07-odometer/POST.odometer.response.json'),
        404: errorRef('NotFound'),
        409: errorRef('InvalidState'),
        422: errorRef('ValidationError'),
        ...authErrors,
      },
    },
  },
  '/delivery-orders/{id}/expenses': {
    get: {
      tags: ['Perjalanan'],
      summary: 'Daftar biaya perjalanan',
      security: secured,
      parameters: doId,
      responses: {
        200: jsonResponse(
          'OK',
          envelope(arr(ref('ExpenseListItem')), ref('ExpenseListMeta')),
          '08-expenses/GET.expenses.response.json'
        ),
        404: errorRef('NotFound'),
        ...authErrors,
      },
    },
    post: {
      tags: ['Perjalanan'],
      summary: 'Catat biaya (BBM dari struk / manual)',
      description: '`category=bbm` memakai foto struk + hasil OCR. Kategori `tol`, `parkir`, `lainnya` diisi manual '
        + '(`description` wajib untuk `lainnya`). Struk yang sama (hash foto/isi) tidak boleh dipakai di DO lain.',
      security: secured,
      parameters: doId,
      requestBody: jsonBody({ oneOf: [ref('ExpenseBbmRequest'), ref('ExpenseManualRequest')] }, {
        'BBM (struk + koreksi)': '08-expenses/POST.expenses.bbm.request.json',
        'Manual - parkir': '08-expenses/POST.expenses.manual.parkir.request.json',
        'Manual - lainnya': '08-expenses/POST.expenses.manual.lainnya.request.json',
      }),
      responses: {
        201: jsonResponse('Tersimpan', envelope({ oneOf: [ref('ExpenseBbmResponse'), ref('ExpenseManualResponse')] }), {
          BBM: '08-expenses/POST.expenses.bbm.response.json',
          Manual: '08-expenses/POST.expenses.manual.response.json',
        }),
        404: errorRef('NotFound'),
        409: errorRef('DuplicateReceipt'),
        422: errorRef('ValidationError'),
        ...authErrors,
      },
    },
  },
  '/delivery-orders/{id}/handover': {
    post: {
      tags: ['Perjalanan'],
      summary: 'Serah terima barang',
      description: '`condition`: `lengkap` -> terkirim_lengkap, `masalah` -> terkirim_catatan (isi `issues`), '
        + '`gagal_kirim` -> gagal_kirim (isi `failure_reason` + foto lokasi).',
      security: secured,
      parameters: doId,
      requestBody: jsonBody(ref('HandoverRequest'), {
        Lengkap: '09-handover/POST.handover.request.lengkap.json',
        'Ada masalah': '09-handover/POST.handover.request.masalah.json',
        'Gagal kirim': '09-handover/POST.handover.request.gagal.json',
      }),
      responses: {
        201: jsonResponse('Tersimpan', envelope(ref('HandoverResponse')), '09-handover/POST.handover.response.json'),
        404: errorRef('NotFound'),
        409: errorRef('InvalidState'),
        422: errorRef('ValidationError'),
        ...authErrors,
      },
    },
  },
  '/delivery-orders/{id}/summary': {
    get: {
      tags: ['Perjalanan'],
      summary: 'Ringkasan perjalanan & selisih uang jalan',
      description: '`settlement.type`: `refund_to_company` (sisa disetor), `payable_to_driver` (kurang bayar), `balanced`.',
      security: secured,
      parameters: doId,
      responses: {
        200: jsonResponse('OK', envelope(ref('Summary')), {
          'Sisa disetor': '10-summary/GET.summary.response.json',
          'Kurang bayar ke driver': '10-summary/GET.summary.response.kurang-bayar.json',
        }),
        404: errorRef('NotFound'),
        ...authErrors,
      },
    },
  },
  '/delivery-orders/{id}/complete': {
    post: {
      tags: ['Perjalanan'],
      summary: 'Selesaikan DO',
      description: 'Mengunci DO (`locked: true`). Setelah ini data perjalanan tidak bisa diubah dari aplikasi.',
      security: secured,
      parameters: doId,
      requestBody: jsonBody(ref('CompleteRequest'), '10-summary/POST.complete.request.json'),
      responses: {
        200: jsonResponse('OK', envelope(ref('CompleteResponse')), '10-summary/POST.complete.response.json'),
        404: errorRef('NotFound'),
        409: errorRef('InvalidState'),
        ...authErrors,
      },
    },
  },

  // ===================== Sync =====================
  '/sync/batch': {
    post: {
      tags: ['Sync'],
      summary: 'Kirim antrean offline sekaligus',
      description: 'Setiap item diproses seperti request biasa ke `path`, berurutan sesuai `client_created_at`. '
        + 'Item dengan `client_ref` yang sudah pernah diproses dikembalikan sebagai `duplicate_ignored` beserta id aslinya.',
      security: secured,
      requestBody: jsonBody(ref('SyncBatchRequest'), '13-sync/POST.sync.batch.request.json'),
      responses: {
        200: jsonResponse('OK', envelope(ref('SyncBatchResponse')), '13-sync/POST.sync.batch.response.json'),
        422: errorRef('ValidationError'),
        ...authErrors,
      },
    },
  },
}
