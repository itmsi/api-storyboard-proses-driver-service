const config = require('../../config')
const logger = require('../../utils/logger')
const { AppError } = require('../../utils/errors')
const { decrypt } = require('../../utils/tenant-crypto')

/**
 * Registry ke saas-api (control plane), lihat saas-api/logistics-saas-api.md bagian 6.9.
 *
 *   resolve              GET /tenants/{client_code}/resolve                      X-Internal-Key = INTERNAL_API_KEY
 *   resolveProvisioning  GET /tenants/by-id/{client_id}/resolve?scope=provisioning  X-Internal-Key = INTERNAL_PROVISIONING_KEY
 *
 * - 404 (TENANT_NOT_ACTIVE) = client tidak ada ATAU belum/tidak aktif (saas-api tidak membedakan) -> null.
 * - saas-api tidak terjangkau, kunci ditolak, atau password tidak bisa didekripsi -> TENANT_UNAVAILABLE (503):
 *   itu masalah konfigurasi/infrastruktur, bukan salah client code, jadi tidak boleh terlihat sebagai "client tidak dikenal".
 * - Kredensial tidak pernah masuk log maupun pesan error.
 */

const unavailable = (reason) => {
  logger.error(`saas-api: ${reason}`)
  return new AppError('TENANT_UNAVAILABLE')
}

const call = async (path, key) => {
  if (!key) throw unavailable('kunci internal belum dikonfigurasi (INTERNAL_API_KEY / INTERNAL_PROVISIONING_KEY)')

  let res
  try {
    res = await fetch(`${config.saas.apiUrl}${path}`, {
      headers: { 'X-Internal-Key': key, Accept: 'application/json' },
      signal: AbortSignal.timeout(config.saas.timeoutMs),
    })
  } catch (err) {
    throw unavailable(`tidak terjangkau (${err.name === 'TimeoutError' ? 'timeout' : (err.cause && err.cause.code) || err.name})`)
  }

  if (res.status === 404) return null
  if (res.status === 401 || res.status === 403) throw unavailable('kunci internal ditolak')
  if (!res.ok) throw unavailable(`HTTP ${res.status}`)

  let body
  try {
    body = await res.json()
  } catch (err) {
    throw unavailable('respons bukan JSON')
  }
  return body && typeof body === 'object' && 'data' in body ? body.data : body
}

/** Koneksi pg dari blok db{host, port, database, username, password_enc}. */
const toConnection = (db) => {
  let password
  try {
    password = decrypt(db.password_enc)
  } catch (err) {
    throw unavailable('password tenant tidak bisa didekripsi (periksa TENANT_DB_ENC_KEY)')
  }
  return {
    host: db.host, port: db.port, user: db.username, password, database: db.database,
  }
}

const buildRemoteRegistry = () => ({
  resolve: async (code) => {
    // saas-api menyimpan client_code huruf kecil
    const data = await call(`/tenants/${encodeURIComponent(String(code).toLowerCase())}/resolve`, config.internal.apiKey)
    if (!data) return null
    return {
      code: String(data.client_code).toUpperCase(),
      name: data.name,
      status: data.status === 'active' ? 'active' : 'inactive',
      connection: toConnection(data.db),
      poolMax: data.db.pool_max || undefined,
      clientId: data.client_id,
      schemaVersion: data.schema_version || null,
    }
  },

  resolveProvisioning: async (clientId) => {
    const data = await call(`/tenants/by-id/${encodeURIComponent(clientId)}/resolve?scope=provisioning`, config.internal.provisioningKey)
    if (!data) return null
    return {
      code: String(data.client_code).toUpperCase(),
      name: data.name,
      owner: toConnection(data.db_owner),
      app: toConnection(data.db),
      systemUser: data.system_user && data.system_user.username ? {
        username: data.system_user.username,
        password: (() => {
          try {
            return decrypt(data.system_user.password_enc)
          } catch (err) {
            throw unavailable('password system user tidak bisa didekripsi (periksa TENANT_DB_ENC_KEY)')
          }
        })(),
      } : null,
    }
  },

  // Daftar tenant dikelola saas-api; rollout migrasi ke semua tenant dilakukan dari sana (POST /migrations/rollout)
  listCodes: async () => {
    throw new Error('listCodes tidak tersedia pada registry remote; gunakan rollout migrasi di saas-api')
  },
})

module.exports = { buildRemoteRegistry }
