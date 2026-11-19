const {
  ref, envelope, jsonResponse, jsonBody, errorRef, secured,
} = require('../helpers')

const idPath = [{
  name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' }
}]

// Parameter daftar standar: page, limit, search, sort, sort_by (sort_by disisipkan di src/static/index.js)
const listParams = (sortValues, searchHint, extra = []) => [
  { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1, default: 1 } },
  {
    name: 'limit',
    in: 'query',
    schema: {
      type: 'integer', minimum: 1, maximum: 100, default: 20
    },
  },
  {
    name: 'search', in: 'query', description: searchHint, schema: { type: 'string', maxLength: 100 }
  },
  {
    name: 'sort',
    in: 'query',
    description: `Kolom urut: ${sortValues.join(', ')} (default ${sortValues[0]}). Arah urut lewat \`sort_by\` (DESC default / ASC). Nilai lain diabaikan.`,
    schema: { type: 'string', example: sortValues[0] },
  },
  ...extra,
]

const errors = {
  401: jsonResponse('Token tidak ada / tidak valid / akun admin dinonaktifkan', ref('Error')),
  403: jsonResponse('Bukan token admin', ref('Error')),
  429: errorRef('RateLimited'),
}
const withValidation = { ...errors, 422: errorRef('ValidationError') }
const notFound = { 404: errorRef('NotFound') }
const inUse = (what) => ({ 409: jsonResponse(`${what} (CONFLICT, \`details.reason = masih_dipakai\`; pesannya menjelaskan penyebab)`, ref('Error')) })
const deleted = envelope({ type: 'object', properties: { deleted: { type: 'boolean', example: true } } })
const paged = (item) => envelope({ type: 'array', items: ref(item) }, ref('PageMeta'))

/** Lima operasi CRUD standar untuk satu resource. */
const crud = ({
  tag, label, base, schemaName, sortValues, searchHint, listExtra, createDesc, deleteDesc, deleteGuard, updateDesc,
}) => ({
  [base]: {
    get: {
      tags: [tag],
      summary: `Daftar ${label}`,
      security: secured,
      parameters: listParams(sortValues, searchHint, listExtra),
      responses: { 200: jsonResponse('OK', paged(schemaName)), ...withValidation },
    },
    post: {
      tags: [tag],
      summary: 'Buat baru',
      description: createDesc,
      security: secured,
      requestBody: jsonBody(ref(`${schemaName}Create`)),
      responses: { 201: jsonResponse('Dibuat', envelope(ref(schemaName))), ...withValidation },
    },
  },
  [`${base}/{id}`]: {
    get: {
      tags: [tag],
      summary: 'Detail',
      security: secured,
      parameters: idPath,
      responses: { 200: jsonResponse('OK', envelope(ref(schemaName))), ...withValidation, ...notFound },
    },
    put: {
      tags: [tag],
      summary: 'Ubah',
      description: updateDesc || 'Kirim hanya field yang ingin diubah; field lain dibiarkan. Isi minimal satu field.',
      security: secured,
      parameters: idPath,
      requestBody: jsonBody(ref(`${schemaName}Update`)),
      responses: { 200: jsonResponse('OK', envelope(ref(schemaName))), ...withValidation, ...notFound },
    },
    delete: {
      tags: [tag],
      summary: 'Hapus (soft delete)',
      description: deleteDesc,
      security: secured,
      parameters: idPath,
      responses: {
        200: jsonResponse('OK', deleted), ...inUse(deleteGuard), ...withValidation, ...notFound,
      },
    },
  },
})

module.exports = {
  ...crud({
    tag: 'Master Data',
    label: 'unit',
    base: '/units',
    schemaName: 'AdminUnit',
    sortValues: ['plate', 'status', 'type', 'year', 'created_at', 'stnk_expires_on', 'kir_expires_on'],
    searchHint: 'Cari plat, merek, tipe, atau nomor rangka (VIN)',
    listExtra: [
      { name: 'status', in: 'query', schema: { type: 'string', enum: ['active', 'maintenance', 'inactive'] } },
      {
        name: 'unit_type', in: 'query', description: 'Tipe unit persis (huruf besar/kecil diabaikan)', schema: { type: 'string', maxLength: 40 }
      },
      {
        name: 'brand', in: 'query', description: 'Merek persis (huruf besar/kecil diabaikan)', schema: { type: 'string', maxLength: 60 }
      },
      {
        name: 'driver_id', in: 'query', description: 'Unit yang driver bawaannya driver ini', schema: { type: 'string', format: 'uuid' }
      },
      {
        name: 'has_driver', in: 'query', description: 'true = punya driver bawaan, false = belum', schema: { type: 'boolean' }
      },
      {
        name: 'stnk_status', in: 'query', description: 'Masa berlaku STNK: expired (sudah lewat), expiring (akan habis dalam expiring_days), valid, unknown (belum diisi)', schema: { type: 'string', enum: ['expired', 'expiring', 'valid', 'unknown'] }
      },
      {
        name: 'kir_status', in: 'query', description: 'Masa berlaku KIR, nilai sama dengan stnk_status', schema: { type: 'string', enum: ['expired', 'expiring', 'valid', 'unknown'] }
      },
      {
        name: 'expiring_days',
        in: 'query',
        description: 'Batas "akan habis" dalam hari (1-365)',
        schema: {
          type: 'integer', minimum: 1, maximum: 365, default: 30
        }
      },
    ],
    createDesc: 'Plat dinormalisasi ke bentuk baku (`b-9123-kz` menjadi `B 9123 KZ`) dan unik di antara unit aktif walau spasi/huruf besar-kecil berbeda. '
      + '`stnk_expired` / `kir_expired` pada response menandai dokumen kedaluwarsa (hanya penanda, tidak memblokir).',
    updateDesc: 'Kirim hanya field yang ingin diubah. Mengubah `status` ke selain `active` ditolak jika unit masih dipakai (lihat Hapus).',
    deleteDesc: 'Hapus dan nonaktifkan (`status` selain `active`) ditolak jika unit masih dipakai DO yang belum final.',
    deleteGuard: 'Unit masih dipakai DO',
  }),
  ...crud({
    tag: 'Master Data',
    label: 'customer',
    base: '/customers',
    schemaName: 'AdminCustomer',
    sortValues: ['name', 'code', 'nomor_customer', 'created_at'],
    searchHint: 'Cari kode, nama, nomor customer, telepon, atau email',
    listExtra: [
      {
        name: 'has_locations', in: 'query', description: 'true = punya lokasi aktif, false = belum punya', schema: { type: 'boolean' }
      },
      {
        name: 'has_open_orders', in: 'query', description: 'true = punya DO yang belum final, false = tidak', schema: { type: 'boolean' }
      },
    ],
    createDesc: '`code` unik di antara data aktif dan tidak bisa diubah setelah dibuat. Email disimpan huruf kecil.',
    deleteDesc: 'Ditolak jika masih punya DO yang belum final, atau masih punya lokasi aktif (hapus lokasinya dulu).',
    deleteGuard: 'Customer masih dipakai DO atau punya lokasi',
  }),
  ...crud({
    tag: 'Master Data',
    label: 'lokasi',
    base: '/locations',
    schemaName: 'AdminLocation',
    sortValues: ['name', 'type', 'city', 'created_at'],
    searchHint: 'Cari nama, alamat, atau kota',
    listExtra: [
      { name: 'type', in: 'query', schema: { type: 'string', enum: ['warehouse', 'depot', 'customer_site'] } },
      { name: 'customer_id', in: 'query', schema: { type: 'string', format: 'uuid' } },
      {
        name: 'city', in: 'query', description: 'Kota persis (huruf besar/kecil diabaikan)', schema: { type: 'string', maxLength: 80 }
      },
      {
        name: 'has_coordinates', in: 'query', description: 'true = sudah punya koordinat (lat dan lng)', schema: { type: 'boolean' }
      },
      {
        name: 'has_maps_url', in: 'query', description: 'true = sudah punya tautan Google Maps', schema: { type: 'boolean' }
      },
    ],
    createDesc: 'Jenis `customer_site` wajib memilih `customer_id`; `warehouse`/`depot` tidak boleh terkait customer. '
      + 'Koordinat (`lat` dan `lng`) boleh kosong, tapi jika diisi harus berpasangan. `geofence_radius_m` default 200.',
    updateDesc: 'Aturan customer dan koordinat dicek pada data gabungan. Mengubah `type` ke gudang/depot otomatis melepas customer. '
      + 'Mengubah lokasi tidak mengubah DO lama (DO menyimpan salinan alamat).',
    deleteDesc: 'Ditolak jika masih dipakai DO yang belum final sebagai asal atau tujuan. DO lama tetap menyimpan alamat aslinya.',
    deleteGuard: 'Lokasi masih dipakai DO',
  }),
}
