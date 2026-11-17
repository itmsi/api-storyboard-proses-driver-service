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
        200: jsonResponse('Sudah pernah diupload dengan `client_ref` yang sama (isi sama dengan upload pertama)', envelope(ref('Media')), '03-media/POST.media.response.json'),
        201: jsonResponse('Tersimpan', envelope(ref('Media')), '03-media/POST.media.response.json'),
        413: { description: 'File terlalu besar', content: { 'application/json': { schema: ref('Error') } } },
        415: { description: 'Tipe file tidak didukung', content: { 'application/json': { schema: ref('Error') } } },
        422: errorRef('ValidationError'),
        ...authErrors,
      },
    },
  },

  '/media/{id}/ai-check': {
    post: {
      tags: ['Media'],
      summary: 'Minta AI ikut mengecek foto, atau membacanya ulang (opsional)',
      description: [
        'FE atau admin yang meminta; tidak otomatis saat upload. **Driver**: hanya foto miliknya (hak `driver_ai_check:create`). **Admin**: foto driver mana pun (hak `media:update`).',
        '**Membaca ulang (regenerate):** kirim `{ "regenerate": true }`. Pengecekan yang sudah selesai diantrekan ulang (`202`, baris yang sama); hasil lama tetap tampil di bacaan sampai hasil baru berhasil, lalu diganti dan penanda `needs_review` dihitung ulang. Yang gagal selalu bisa diminta ulang tanpa badan ini. Dihitung ke batas permintaan per jam peminta.',
        'Jenis bacaan diturunkan dari jenis foto. Foto dashboard (`odometer_start`, `odometer_end`) dibaca sebagai km dan level bahan bakar, foto `receipt` sebagai struk BBM; jenis foto lain ditolak 422.',
        '**Hasil AI hanya pembanding**: tidak mengubah nilai bacaan. FE tetap mengirim hasil OCR-nya atau koreksi seperti biasa, dan tidak perlu menunggu hasil ini. Hasil AI tersimpan terpisah dari OCR FE dan koreksi driver, dan dilihat admin di detail DO.',
        'Pekerjaan masuk antrean: respons `202` berisi `id`; pantau lewat `GET /ai-checks/{id}`. Idempoten per foto: yang sudah antre/diproses dikembalikan `202`, yang sudah selesai `200`, dan yang gagal diantrekan ulang (`202`).',
        'Ditolak: `409 INVALID_STATE` dengan `details.reason` = `ai_nonaktif` (AI dimatikan di server) atau `api_key_belum_diisi` (admin client belum mengisi API key, lihat `PUT /settings/ai`); `429` bila melewati batas permintaan per jam; `404` bila foto bukan milik driver ini. Hak: `driver_ai_check:create`.',
      ].join('\n'),
      security: secured,
      parameters: [{ $ref: '#/components/parameters/MediaId' }],
      requestBody: { required: false, content: { 'application/json': { schema: ref('AiCheckRequest') } } },
      responses: {
        200: jsonResponse('Hasil sudah ada (status done) dan tidak diminta dibaca ulang', envelope(ref('AiCheck'))),
        202: jsonResponse('Masuk antrean atau masih diproses', envelope(ref('AiCheck'))),
        404: errorRef('NotFound'),
        409: errorRef('InvalidState'),
        422: errorRef('ValidationError'),
        429: errorRef('RateLimited'),
        ...authErrors,
      },
    },
  },
  '/ai-checks/{id}': {
    get: {
      tags: ['Media'],
      summary: 'Status dan hasil pengecekan AI',
      description: 'Driver (hak `driver_ai_check:read`): pengecekan atas foto miliknya sendiri (juga bila admin yang meminta ulang). Admin (hak `media:read`): semua. `result` hanya terisi bila `status` = `done`.',
      security: secured,
      parameters: [{ $ref: '#/components/parameters/AiCheckId' }],
      responses: {
        200: jsonResponse('OK', envelope(ref('AiCheck'))),
        404: errorRef('NotFound'),
        422: errorRef('ValidationError'),
        ...authErrors,
      },
    },
  },

  // ===================== P2H =====================
  '/p2h/template': {
    get: {
      tags: ['P2H'],
      summary: 'Template checklist P2H',
      description: 'Driver (hak `driver_p2h:read`) dan admin (hak `p2h:read`).',
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
      description: 'Driver (hak `driver_p2h:read`): hanya unit yang ditugaskan kepadanya hari ini. Admin (hak `p2h:read`): unit mana pun, tanpa penugasan. '
        + 'P2H berlaku per unit per hari (sampai 23:59 waktu lokal). Driver lain yang memakai unit yang sama '
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
        403: jsonResponse('Unit tidak ditugaskan ke driver ini hari ini', ref('Error')),
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
        200: jsonResponse('Sudah pernah dikirim dengan `client_ref` yang sama (hasil sama)', envelope(ref('P2HSubmitResponse')), '04-p2h/POST.units.p2h.response.json'),
        403: jsonResponse('Unit tidak ditugaskan ke driver ini hari ini', ref('Error')),
        409: { description: 'P2H hari ini sudah ada (CONFLICT, `details.p2h_id`)', content: { 'application/json': { schema: ref('Error') } } },
        422: errorRef('ValidationError'),
        ...authErrors,
      },
    },
  },
}
