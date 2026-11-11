const config = require('../../config')

/**
 * TenantRegistry = sumber kredensial database per client (client code).
 *
 * Kontrak (apa pun implementasinya):
 *   resolve(code)
 *     -> { code, name, status: 'active' | 'inactive', connection: { host, port, user, password, database, ssl? },
 *          poolMax?, clientId?, schemaVersion? }  atau null jika client code tidak dikenal / tidak aktif.
 *        Ini kredensial role APP (hanya DML) untuk request biasa.
 *   resolveProvisioning(clientId)
 *     -> { code, name, owner: connection, app: connection, systemUser: { username, password } | null }  atau null.
 *        Ini untuk migrasi/seeder: role OWNER (boleh DDL), terhubung langsung ke Postgres, dan akun sistem MSI.
 *   listCodes()   -> string[]   (script migrasi --all; tidak tersedia di mode remote)
 *
 * Adapter:
 *   env    - daftar tenant dari .env, satu koneksi untuk semua peran (dev & test)
 *   remote - saas-api (control plane), kredensial terenkripsi AES-256-GCM (produksi)
 */

const buildEnvRegistry = () => {
  let tenants
  if (config.tenant.devTenantsJson) {
    tenants = JSON.parse(config.tenant.devTenantsJson)
  } else {
    tenants = [{
      code: config.tenant.devCode,
      name: config.tenant.devName,
      status: 'active',
      connection: config.db.connection,
    }]
  }

  const byCode = new Map(tenants.map((t) => [String(t.code).toUpperCase(), { status: 'active', ...t }]))

  return {
    resolve: async (code) => byCode.get(code) || null,
    // Di dev id client = kode client, dan satu koneksi dipakai untuk semua peran
    resolveProvisioning: async (clientId) => {
      const tenant = byCode.get(String(clientId).toUpperCase())
      if (!tenant) return null
      return {
        code: String(tenant.code).toUpperCase(),
        name: tenant.name,
        owner: tenant.connection,
        app: tenant.connection,
        systemUser: { username: config.tenant.devSystemUsername, password: config.tenant.devSystemPassword },
      }
    },
    listCodes: async () => [...byCode.keys()],
  }
}

const registries = {
  env: buildEnvRegistry,
  remote: () => require('./registry.remote').buildRemoteRegistry(),
}

const createRegistry = () => {
  const factory = registries[config.tenant.registry]
  if (!factory) {
    throw new Error(`TENANT_REGISTRY="${config.tenant.registry}" tidak dikenal (tersedia: ${Object.keys(registries).join(', ')})`)
  }
  return factory()
}

module.exports = { createRegistry }
