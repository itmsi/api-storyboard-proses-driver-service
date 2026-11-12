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
      summary: 'Daftar DO (isi mengikuti peran)',
      description: [
        '**Driver:** DO miliknya, dipakai layar "DO ditugaskan" dengan `status=assigned`. Tanpa `status`: semua DO yang belum selesai. `meta = { count }`.',
        '**Admin:** semua DO perusahaan, dengan pagination (`page`, `limit`, `sort`), `search` (nomor DO, barang, driver, plat, customer), dan filter `status`, `driver_id`, `unit_id`, `customer_id`, `from`/`to` (tanggal jadwal muat, WIB). `meta` = pagination standar.',
      ].join('\n'),
      security: secured,
      parameters: [
        {
          name: 'status',
          in: 'query',
          required: false,
          description: 'Driver: assigned, accepted, loading, in_transit, handover. Admin: semua status termasuk completed dan cancelled.',
          schema: { type: 'string', enum: ['assigned', 'accepted', 'loading', 'in_transit', 'handover', 'completed', 'cancelled'], example: 'assigned' },
        },
        {
          name: 'page', in: 'query', description: 'Hanya admin', schema: { type: 'integer', minimum: 1, default: 1 }
        },
        {
          name: 'limit',
          in: 'query',
          description: 'Hanya admin',
          schema: {
            type: 'integer', minimum: 1, maximum: 100, default: 20
          },
        },
        {
          name: 'search', in: 'query', description: 'Hanya admin', schema: { type: 'string', maxLength: 100 }
        },
        {
          name: 'sort', in: 'query', description: 'Hanya admin: no, planned_load_at, assigned_at, status, created_at; awalan `-` = menurun (default `-created_at`)', schema: { type: 'string', example: '-created_at' }
        },
        {
          name: 'driver_id', in: 'query', description: 'Hanya admin', schema: { type: 'string', format: 'uuid' }
        },
        {
          name: 'unit_id', in: 'query', description: 'Hanya admin', schema: { type: 'string', format: 'uuid' }
        },
        {
          name: 'customer_id', in: 'query', description: 'Hanya admin', schema: { type: 'string', format: 'uuid' }
        },
        {
          name: 'from', in: 'query', description: 'Hanya admin', schema: { type: 'string', format: 'date', example: '2026-11-01' }
        },
        {
          name: 'to', in: 'query', description: 'Hanya admin', schema: { type: 'string', format: 'date', example: '2026-11-30' }
        },
      ],
      responses: {
        200: jsonResponse(
          'OK',
          envelope({ oneOf: [arr(ref('DeliveryOrder')), arr(ref('AdminDeliveryOrder'))] }, { oneOf: [{ type: 'object', properties: { count: { type: 'integer', example: 1 } } }, ref('PageMeta')] }),
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
      summary: 'Detail DO (isi mengikuti peran)',
      description: 'Driver: DO miliknya (DO driver lain = 404). Admin: detail lengkap beserta linimasa langkah, muat, odometer, biaya, serah terima, rekap keuangan, dan foto.',
      security: secured,
      parameters: doId,
      responses: {
        200: jsonResponse('OK', envelope({ oneOf: [ref('DeliveryOrder'), ref('AdminDeliveryOrderDetail')] }), '05-delivery-orders/GET.delivery-orders.id.response.json'),
        404: errorRef('NotFound'),
        ...authErrors,
      },
    },
  },
  '/delivery-orders/{id}/accept': {
    post: {
      tags: ['Delivery Order'],
      summary: 'Terima DO',
      description: 'Syarat: unit sudah P2H hari ini dan boleh beroperasi, driver tidak punya DO lain yang berjalan, dan unit tidak sedang dipakai DO lain yang berjalan '
        + '(409 `CONFLICT`, `details.reason = unit_sedang_dipakai`). Konfirmasi uang jalan diterima dicatat di sini. '
        + 'Payload push DO baru: schema `PushDoAssigned`.',
      security: secured,
      parameters: doId,
      requestBody: jsonBody(ref('AcceptRequest'), '05-delivery-orders/POST.accept.request.json'),
      responses: {
        200: jsonResponse('OK', envelope(ref('AcceptResponse')), '05-delivery-orders/POST.accept.response.json'),
        404: errorRef('NotFound'),
        409: {
          description: 'P2H belum ada / status DO tidak sesuai / unit sedang dipakai DO lain',
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
      description: 'DO harus berstatus `accepted`; setelahnya `loading`. Jumlah foto mengikuti `photo_rules` di `/config`. '
        + 'Jika jumlah barang tidak sesuai DO, `quantity_note` wajib. Foto harus milik driver, berjenis `loading` / `delivery_note`, dan belum dipakai di data lain. Idempoten per `client_ref`.',
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
      description: '`type=start` setelah muat (DO `loading` -> `in_transit`), `type=end` setelah serah terima (DO `handover`). OCR dilakukan di HP dan hasilnya dikirim di `ocr`. Jika nilai OCR dikoreksi, '
        + '`correction_reason` wajib. Nilai `effective` = koreksi jika ada, selain itu `ocr`; jika `ocr` kosong, `corrected.km` wajib. '
        + 'Odometer akhir tidak boleh lebih kecil dari odometer awal.',
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
      description: 'Hanya saat DO `in_transit` atau `handover`. Kategori dibaca dari `/config` (`expense_categories`): `input=receipt_ocr` (BBM) memakai foto struk + hasil OCR dari HP '
        + '(waktu struk memakai `captured_at`), `input=manual` memakai `amount` + `recorded_at`. Struk yang sama (hash foto atau isi struk) tidak boleh dipakai lagi (409 `DUPLICATE_RECEIPT`). Idempoten per `client_ref`.',
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
      description: 'Hanya saat DO `in_transit` (setelah itu `handover`). `condition`: `lengkap` -> terkirim_lengkap (foto bongkar, surat jalan bercap, penerima + tanda tangan), '
        + '`masalah` -> terkirim_catatan (tambah `issues`, `received_quantity` <= jumlah DO, `receiver.acknowledges_issues`; foto masalah berjenis `damage`), '
        + '`gagal_kirim` -> gagal_kirim (`failure_reason` + foto lokasi; `note` wajib jika alasan `lainnya`; tanpa data bongkar). '
        + 'Hasil pengiriman ditentukan server. Setelah ini catat odometer akhir lalu selesaikan DO. Idempoten per `client_ref`.',
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
      description: 'Tersedia saat DO `handover` dan `completed`. `settlement.type`: `refund_to_company` (sisa disetor), `payable_to_driver` (kurang bayar), `balanced`. '
        + 'Sebelum odometer akhir dicatat, `odometer.end` dan `distance_km` bernilai null.',
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
      description: 'Syarat: DO `handover` dan odometer akhir sudah dicatat (409 `INVALID_STATE` jika belum). Mengunci DO (`locked: true`) dan membekukan rekap keuangan; '
        + 'setelah ini data perjalanan tidak bisa diubah dari aplikasi (409 `DO_LOCKED`). Idempoten per `client_ref`.',
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
      description: 'Antrean offline dari HP. Setiap item diproses seperti request biasa ke `path` (validasi dan aturan bisnis sama), '
        + '**berurutan menurut `client_created_at`** (urutan asli di HP, bukan urutan kirim) supaya langkah yang bergantung (terima -> muat -> odometer -> biaya -> serah terima -> selesai) tetap benar. '
        + `Hasil dikembalikan menurut urutan request. Satu item gagal tidak menghentikan item lain; response tetap 200.${
          [
            '',
            '',
            '- `created`: berhasil diproses. `duplicate_ignored`: `client_ref` sudah pernah diproses, dikembalikan id aslinya (aman dikirim ulang). '
            + '`failed`: lihat `error` (4xx = permanen, perbaiki isinya; 5xx = coba lagi).',
            '- Item gagal dicatat di server dan dihitung di `pending_sync` (bootstrap, layar Berjalan, `GET /me`, peringatan saat logout) '
            + 'sampai berhasil dikirim ulang dengan `client_ref` yang sama.',
            '- Endpoint yang boleh dikirim: `POST /units/{unitId}/p2h`, `POST /delivery-orders/{id}/accept|loading|odometer|expenses|handover|complete`, '
            + '`PUT /me/settings`. Upload foto (`POST /media`, multipart) harus dilakukan langsung dan berhasil dulu, lalu id fotonya dipakai di item.',
            '- Maksimal 100 item per request, `client_ref` tidak boleh ganda dalam satu request.',
          ].join('\n')}`,
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
