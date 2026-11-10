const {
  ref, envelope, jsonResponse, jsonBody, errorRef, authErrors, secured,
} = require('../helpers')

module.exports = {
  // ===================== Media =====================
  '/media': {
    post: {
      tags: ['Media'],
      summary: 'Upload foto dari kamera aplikasi',
      description: 'Semua foto (odometer, struk, muatan, surat jalan, bongkar, P2H, kerusakan, lokasi, tanda tangan) '
        + 'diupload dulu ke sini, lalu `id`-nya dipakai di endpoint lain. Foto dari galeri ditolak. '
        + 'Idempoten berdasarkan `client_ref`.',
      security: secured,
      requestBody: {
        required: true,
        content: { 'multipart/form-data': { schema: ref('MediaUploadRequest') } },
      },
      responses: {
        201: jsonResponse('Tersimpan', envelope(ref('Media')), '03-media/POST.media.response.json'),
        413: { description: 'File terlalu besar', content: { 'application/json': { schema: ref('Error') } } },
        415: { description: 'Tipe file tidak didukung', content: { 'application/json': { schema: ref('Error') } } },
        422: errorRef('ValidationError'),
        ...authErrors,
      },
    },
  },

  // ===================== OCR =====================
  '/ocr/odometer': {
    post: {
      tags: ['OCR'],
      summary: 'Baca angka odometer & level BBM dari foto',
      description: 'Hasil OCR hanya saran; nilai final dikirim ke `POST /delivery-orders/{id}/odometer`.',
      security: secured,
      requestBody: jsonBody(ref('OcrMediaRequest'), '07-odometer/POST.ocr.odometer.request.json'),
      responses: {
        200: jsonResponse('OK', envelope(ref('OcrOdometerResponse')), '07-odometer/POST.ocr.odometer.response.json'),
        404: errorRef('NotFound'),
        ...authErrors,
      },
    },
  },
  '/ocr/receipt': {
    post: {
      tags: ['OCR'],
      summary: 'Baca struk BBM dari foto',
      security: secured,
      requestBody: jsonBody(ref('OcrMediaRequest'), '08-expenses/POST.ocr.receipt.request.json'),
      responses: {
        200: jsonResponse('OK', envelope(ref('OcrReceiptResponse')), '08-expenses/POST.ocr.receipt.response.json'),
        404: errorRef('NotFound'),
        409: errorRef('DuplicateReceipt'),
        ...authErrors,
      },
    },
  },

  // ===================== P2H =====================
  '/p2h/template': {
    get: {
      tags: ['P2H'],
      summary: 'Template checklist P2H',
      security: secured,
      responses: {
        200: jsonResponse('OK', envelope(ref('P2HTemplate')), '04-p2h/GET.p2h.template.response.json'),
        ...authErrors,
      },
    },
  },
  '/units/{unitId}/p2h/today': {
    get: {
      tags: ['P2H'],
      summary: 'Status P2H unit hari ini',
      description: 'P2H berlaku per unit per hari (sampai 23:59 waktu lokal). Driver lain yang memakai unit yang sama '
        + 'cukup melihat hasil P2H yang sudah ada. Jika admin meminta P2H ulang, status kembali `belum` dengan `recheck_requested: true`.',
      security: secured,
      parameters: [{ $ref: '#/components/parameters/UnitId' }],
      responses: {
        200: jsonResponse('OK', envelope(ref('P2HToday')), {
          Belum: '04-p2h/GET.units.p2h.today.response.belum.json',
          Layak: '04-p2h/GET.units.p2h.today.response.layak.json',
          'Layak dengan catatan': '04-p2h/GET.units.p2h.today.response.catatan.json',
          'Diminta P2H ulang': '04-p2h/GET.units.p2h.today.response.ulang.json',
        }),
        404: errorRef('NotFound'),
        ...authErrors,
      },
    },
  },
  '/units/{unitId}/p2h': {
    post: {
      tags: ['P2H'],
      summary: 'Kirim hasil P2H',
      description: 'Status dihitung server: semua `sesuai` -> `layak`; ada `tidak_sesuai` -> `catatan` '
        + '(atau `tidak_layak` jika item kritis). Wajib 4 foto badan (depan, kanan, kiri, belakang).',
      security: secured,
      parameters: [{ $ref: '#/components/parameters/UnitId' }],
      requestBody: jsonBody(ref('P2HSubmitRequest'), '04-p2h/POST.units.p2h.request.json'),
      responses: {
        201: jsonResponse('Tersimpan', envelope(ref('P2HSubmitResponse')), '04-p2h/POST.units.p2h.response.json'),
        404: errorRef('NotFound'),
        409: { description: 'P2H hari ini sudah ada', content: { 'application/json': { schema: ref('Error') } } },
        422: errorRef('ValidationError'),
        ...authErrors,
      },
    },
  },
}
