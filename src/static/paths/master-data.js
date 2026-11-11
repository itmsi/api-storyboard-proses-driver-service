const {
  ref, envelope, jsonResponse, jsonBody, errorRef, secured,
} = require('../helpers')

const idPath = [{
  name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' }
}]

// Parameter daftar standar: ?page=&limit=&search=&sort=
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
    description: `Kolom urut: ${sortValues.join(', ')}. Awalan \`-\` = menurun (mis. \`-name\`). Nilai lain diabaikan.`,
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
  tag, base, schemaName, sortValues, searchHint, listExtra, createDesc, deleteDesc, deleteGuard, updateDesc,
}) => ({
  [base]: {
    get: {
      tags: [tag],
      summary: `Daftar ${tag.replace('Admin - ', '').toLowerCase()}`,
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
    tag: 'Admin - Master Data',
    base: '/unit-types',
    schemaName: 'AdminUnitType',
    sortValues: ['name', 'code', 'max_load_kg', 'created_at'],
    searchHint: 'Cari kode atau nama',
    createDesc: '`code` huruf besar/angka/`_`/`-`, unik di antara data aktif, dan **tidak bisa diubah** setelah dibuat.',
    deleteDesc: 'Ditolak jika masih dipakai unit aktif. Kode dari data yang sudah dihapus boleh dipakai lagi.',
    deleteGuard: 'Tipe unit masih dipakai unit',
  }),
  ...crud({
    tag: 'Admin - Master Data',
    base: '/units',
    schemaName: 'AdminUnit',
    sortValues: ['plate', 'status', 'type', 'year', 'created_at'],
    searchHint: 'Cari plat atau merek',
    listExtra: [
      { name: 'status', in: 'query', schema: { type: 'string', enum: ['active', 'maintenance', 'inactive'] } },
      { name: 'unit_type_id', in: 'query', schema: { type: 'string', format: 'uuid' } },
    ],
    createDesc: 'Plat dinormalisasi ke bentuk baku (`b-9123-kz` menjadi `B 9123 KZ`) dan unik di antara unit aktif walau spasi/huruf besar-kecil berbeda. '
      + '`stnk_expired` / `kir_expired` pada response menandai dokumen kedaluwarsa (hanya penanda, tidak memblokir).',
    updateDesc: 'Kirim hanya field yang ingin diubah. Mengubah `status` ke selain `active` ditolak jika unit masih dipakai (lihat Hapus).',
    deleteDesc: 'Hapus dan nonaktifkan (`status` selain `active`) ditolak jika unit masih dipakai DO yang belum final, atau masih ada penugasan hari ini / ke depan.',
    deleteGuard: 'Unit masih dipakai DO atau penugasan',
  }),
  ...crud({
    tag: 'Admin - Master Data',
    base: '/customers',
    schemaName: 'AdminCustomer',
    sortValues: ['name', 'code', 'created_at'],
    searchHint: 'Cari kode, nama, telepon, atau email',
    createDesc: '`code` unik di antara data aktif dan tidak bisa diubah setelah dibuat. Email disimpan huruf kecil.',
    deleteDesc: 'Ditolak jika masih punya DO yang belum final, atau masih punya lokasi aktif (hapus lokasinya dulu).',
    deleteGuard: 'Customer masih dipakai DO atau punya lokasi',
  }),
  ...crud({
    tag: 'Admin - Master Data',
    base: '/locations',
    schemaName: 'AdminLocation',
    sortValues: ['name', 'type', 'city', 'created_at'],
    searchHint: 'Cari nama, alamat, atau kota',
    listExtra: [
      { name: 'type', in: 'query', schema: { type: 'string', enum: ['warehouse', 'depot', 'customer_site'] } },
      { name: 'customer_id', in: 'query', schema: { type: 'string', format: 'uuid' } },
    ],
    createDesc: 'Jenis `customer_site` wajib memilih `customer_id`; `warehouse`/`depot` tidak boleh terkait customer. '
      + 'Koordinat (`lat` dan `lng`) boleh kosong, tapi jika diisi harus berpasangan. `geofence_radius_m` default 200.',
    updateDesc: 'Aturan customer dan koordinat dicek pada data gabungan. Mengubah `type` ke gudang/depot otomatis melepas customer. '
      + 'Mengubah lokasi tidak mengubah DO lama (DO menyimpan salinan alamat).',
    deleteDesc: 'Ditolak jika masih dipakai DO yang belum final sebagai asal atau tujuan. DO lama tetap menyimpan alamat aslinya.',
    deleteGuard: 'Lokasi masih dipakai DO',
  }),
}
