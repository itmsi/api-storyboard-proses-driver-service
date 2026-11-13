const {
  ref, envelope, jsonResponse, errorRef, secured, authErrors,
} = require('../helpers')

// Baca ulang langkah perjalanan milik driver sendiri (muat, odometer, serah terima), untuk menampilkan ulang di aplikasi
// setelah aplikasi dibuka lagi atau HP diganti. Hak: driver_delivery_orders:read. Pembuatan datanya ada di endpoint POST dengan path yang sama.
const doId = [{ $ref: '#/components/parameters/DeliveryOrderId' }]
const notDone = jsonResponse('DO bukan milik driver ini / tidak ada, atau langkah ini belum dilakukan (`details.reason = langkah_belum_dilakukan`)', ref('Error'))

module.exports = {
  '/delivery-orders/{id}/loading': {
    get: {
      tags: ['Perjalanan'],
      summary: 'Baca ulang foto muatan & surat jalan',
      description: 'Isi langkah muat yang sudah disimpan: waktu, jawaban jumlah muatan sesuai DO, foto muatan, dan halaman surat jalan (dengan url dan thumb_url). `404` bila langkah muat belum dilakukan.',
      security: secured,
      parameters: doId,
      responses: { 200: jsonResponse('OK', envelope(ref('LoadingDetail'))), 404: notDone, ...authErrors },
    },
  },
  '/delivery-orders/{id}/odometer': {
    get: {
      tags: ['Perjalanan'],
      summary: 'Baca ulang odometer awal dan akhir',
      description: 'Kedua bacaan odometer dengan nilai efektif, hasil OCR, koreksi beserta alasan, dan fotonya. Yang belum dicatat bernilai `null` (DO yang baru diterima: keduanya `null`). `distance_km` terisi bila keduanya ada.',
      security: secured,
      parameters: doId,
      responses: { 200: jsonResponse('OK', envelope(ref('OdometerDetail'))), 404: errorRef('NotFound'), ...authErrors },
    },
  },
  '/delivery-orders/{id}/handover': {
    get: {
      tags: ['Perjalanan'],
      summary: 'Baca ulang serah terima',
      description: 'Isi serah terima yang sudah disimpan: kondisi (`lengkap` / `masalah` / `gagal_kirim`), penerima dan tanda tangan, foto bongkar, surat jalan bercap, foto lokasi, dan masalah beserta fotonya. `404` bila serah terima belum dilakukan.',
      security: secured,
      parameters: doId,
      responses: { 200: jsonResponse('OK', envelope(ref('HandoverDetail'))), 404: notDone, ...authErrors },
    },
  },
}
