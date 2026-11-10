const {
  ref, envelope, jsonResponse, errorRef,
} = require('../helpers')

const internalKey = [{ internalKey: [] }]

const clientCode = {
  name: 'clientCode', in: 'path', required: true, description: 'Client code (tidak membedakan huruf besar/kecil)', schema: { type: 'string', example: 'ACME' },
}

const internalErrors = {
  401: jsonResponse('`X-Internal-Key` tidak ada / salah', ref('Error')),
  404: jsonResponse('Client code tidak dikenal, atau endpoint internal nonaktif (`INTERNAL_API_KEY` kosong)', ref('Error')),
  422: errorRef('ValidationError'),
}

module.exports = {
  '/internal/tenants/{clientCode}/migrate': {
    post: {
      tags: ['Internal'],
      summary: 'Jalankan migrasi database client',
      description: 'Dipanggil project **manage company** setelah database client dibuat (atau saat ada versi skema baru). '
        + 'Kredensial database diambil dari registry tenant, bukan dari request.\n\n'
        + '- **Idempoten**: dipanggil berulang aman; jika sudah terbaru, `applied` kosong.\n'
        + '- **Sinkron**: response baru dikirim setelah migrasi selesai (beberapa detik). Gunakan timeout klien ≥ 60 detik.\n'
        + '- Client yang belum aktif tetap boleh dimigrasi.\n'
        + '- 409 `MIGRATION_IN_PROGRESS`: migrasi client ini sedang berjalan, coba lagi nanti (aman di-retry).\n'
        + '- 503 `TENANT_UNAVAILABLE`: database client tidak dapat dihubungi (belum dibuat / kredensial salah); retry setelah diperbaiki.\n'
        + '- 500 `MIGRATION_FAILED`: migrasi gagal; `details.reason` berisi penyebab.',
      security: internalKey,
      parameters: [clientCode],
      responses: {
        200: jsonResponse('Selesai', envelope(ref('MigrationResult')), {
          'Ada migrasi baru': '14-internal/POST.migrate.response.json',
          'Sudah terbaru': '14-internal/POST.migrate.response.noop.json',
        }),
        ...internalErrors,
        409: jsonResponse('Migrasi sedang berjalan', ref('Error'), '14-internal/POST.migrate.error.in-progress.json'),
        500: jsonResponse('Migrasi gagal', ref('Error')),
        503: jsonResponse('Database client tidak dapat dihubungi', ref('Error')),
      },
    },
  },
  '/internal/tenants/{clientCode}/migration-status': {
    get: {
      tags: ['Internal'],
      summary: 'Status migrasi database client',
      description: 'Untuk memeriksa apakah skema client sudah terbaru, tanpa mengubah apa pun.',
      security: internalKey,
      parameters: [clientCode],
      responses: {
        200: jsonResponse('OK', envelope(ref('MigrationStatus')), '14-internal/GET.migration-status.response.json'),
        ...internalErrors,
        503: jsonResponse('Database client tidak dapat dihubungi', ref('Error')),
      },
    },
  },
}
