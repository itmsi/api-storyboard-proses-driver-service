const {
  ref, envelope, jsonResponse, jsonBody, errorRef,
} = require('../helpers')

const internalKey = [{ internalKey: [] }]
// Path internal berada di root server, bukan di bawah /api/v1
const rootServer = [{ url: '/', description: 'Root (tanpa /api/v1)' }]

const clientId = {
  name: 'client_id', in: 'path', required: true, description: 'ID client di saas-api (di dev = client code)', schema: { type: 'string', example: 'cl_acme' },
}

const errors = {
  401: jsonResponse('`X-Internal-Key` tidak ada / salah', ref('Error')),
  404: jsonResponse('Client tidak dikenal, atau endpoint internal nonaktif (`INTERNAL_PROVISIONING_KEY` kosong)', ref('Error')),
  422: errorRef('ValidationError'),
  503: jsonResponse('saas-api atau database client tidak dapat dihubungi (`TENANT_UNAVAILABLE`)', ref('Error')),
}

const op = (summary, description, extra) => ({
  tags: ['Internal'], summary, description, security: internalKey, ...extra,
})

module.exports = {
  '/internal/migrations/status': {
    servers: rootServer,
    get: op('Daftar migrasi yang dikenal API ini', 'Untuk saas-worker membandingkan versi skema client dengan versi terbaru API.', {
      responses: { 200: jsonResponse('OK', envelope(ref('MigrationCatalog'))), 401: errors[401], 404: errors[404] },
    }),
  },
  '/internal/tenants/{client_id}/migrate': {
    servers: rootServer,
    post: op('Migrasi database client', [
      'Database dan role-nya sudah dibuat saas-worker. Kredensial **owner** diminta ke saas-api, bukan dari request.',
      '',
      '- **Idempoten**: aman dipanggil berulang; jika sudah terbaru `applied` kosong.',
      '- **Sinkron**: response dikirim setelah selesai; pakai timeout klien ≥ 60 detik.',
      '- 409 `TENANT_LOCKED`: migrasi client ini sedang berjalan (transient, retry).',
      '- 500 `MIGRATION_FAILED`: `details.reason` berisi penyebab.',
    ].join('\n'), {
      parameters: [clientId],
      responses: {
        200: jsonResponse('Selesai', envelope(ref('MigrationResult'))),
        ...errors,
        409: jsonResponse('Sedang dikunci (`TENANT_LOCKED`)', ref('Error')),
        500: jsonResponse('Migrasi gagal', ref('Error')),
      },
    }),
  },
  '/internal/tenants/{client_id}/seed': {
    servers: rootServer,
    post: op('Seed database client', [
      'Idempoten. Membuat/menyamakan akun sistem MSI (`msi.support`, role admin, `is_system`) dengan password dari saas-api.',
      'Akun ini tidak tampil di `GET /users` dan tidak bisa mengganti passwordnya sendiri.',
      '',
      '409 `INVALID_STATE` bila database belum dimigrasi.',
    ].join('\n'), {
      parameters: [clientId],
      requestBody: jsonBody({
        type: 'object', properties: { include_system_user: { type: 'boolean', default: true } },
      }, undefined, false),
      responses: {
        200: jsonResponse('Selesai', envelope(ref('SeedResult'))),
        ...errors,
        409: jsonResponse('Database belum dimigrasi', ref('Error')),
      },
    }),
  },
  '/internal/tenants/{client_id}/verify': {
    servers: rootServer,
    get: op('Verifikasi database client', 'Read-only, memakai role **app**: bisa login, semua tabel inti ada, migrasi terbaru, dan system user ada.', {
      parameters: [clientId],
      responses: { 200: jsonResponse('Hasil pemeriksaan (`ok` false bila ada yang gagal)', envelope(ref('VerifyResult'))), ...errors },
    }),
  },
  '/internal/tenants/{client_id}/system-user/reset': {
    servers: rootServer,
    post: op('Setel ulang password system user', 'Menyamakan password `msi.support` dengan nilai terbaru di saas-api dan mencabut sesi lamanya.', {
      parameters: [clientId],
      responses: { 200: jsonResponse('Selesai', envelope({ type: 'object', properties: { ok: { type: 'boolean', example: true } } })), ...errors },
    }),
  },
}
