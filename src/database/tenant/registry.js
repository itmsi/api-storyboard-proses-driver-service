const config = require('../../config')

/**
 * TenantRegistry = sumber kredensial database per client (client code).
 *
 * Kontrak (apa pun implementasinya):
 *   resolve(code)  -> { code, name, status: 'active' | 'inactive', connection: { host, port, user, password, database, ssl? } }
 *                     atau null jika client code tidak dikenal
 *   listCodes()    -> string[]   (dipakai script migrasi --all)
 *
 * Sumber aslinya adalah project "manage company". Sebelum kontraknya jelas dipakai adapter `env`.
 * Saat adapter `remote` dibuat, cukup tambahkan file registry.remote.js dan daftarkan di bawah;
 * sisa kode (tenant/index.js, auth) tidak berubah.
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
    listCodes: async () => [...byCode.keys()],
  }
}

const registries = {
  env: buildEnvRegistry,
}

const createRegistry = () => {
  const factory = registries[config.tenant.registry]
  if (!factory) {
    throw new Error(`TENANT_REGISTRY="${config.tenant.registry}" tidak dikenal (tersedia: ${Object.keys(registries).join(', ')})`)
  }
  return factory()
}

module.exports = { createRegistry }
