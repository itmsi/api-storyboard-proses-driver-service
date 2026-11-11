const knex = require('knex')
const config = require('../../config')
const logger = require('../../utils/logger')
const { AppError } = require('../../utils/errors')
const { createRegistry } = require('./registry')

/**
 * Koneksi database per client.
 *
 *   const db = await getDb('OGO')     // knex instance milik client itu
 *
 * - Hasil resolve kredensial di-cache (TENANT_RESOLVE_TTL). Saat kadaluarsa di-resolve ulang;
 *   jika kredensial berubah, pool lama ditutup dan dibuat ulang. Client nonaktif -> CLIENT_INACTIVE.
 * - Jumlah pool dibatasi (TENANT_MAX_POOLS); yang paling lama tidak dipakai ditutup lebih dulu.
 * - Kredensial tidak pernah dicatat di log.
 */

const CODE_PATTERN = /^[A-Z0-9_-]{2,32}$/

let registry
const getRegistry = () => {
  if (!registry) registry = createRegistry()
  return registry
}

const pools = new Map() // code -> { db, fingerprint, resolvedAt, lastUsedAt }
const pending = new Map() // code -> Promise<entry> (cegah buat pool ganda saat request bersamaan)

const normalizeCode = (code) => String(code || '').trim().toUpperCase()

const fingerprint = (connection) => JSON.stringify(connection)

const destroyPool = async (code) => {
  const entry = pools.get(code)
  if (!entry) return
  pools.delete(code)
  await entry.db.destroy().catch(() => {})
}

const evictIfNeeded = async () => {
  while (pools.size >= config.tenant.maxPools) {
    const [oldestCode] = [...pools.entries()].sort((a, b) => a[1].lastUsedAt - b[1].lastUsedAt)[0]
    // eslint-disable-next-line no-await-in-loop
    await destroyPool(oldestCode)
  }
}

const connect = async (code, tenant) => {
  const db = knex({
    client: 'pg',
    connection: { application_name: 'api-ogo-service', ...tenant.connection },
    // pool_max dari saas-api (per client) jika ada; selain itu bawaan
    pool: { min: 0, max: tenant.poolMax || config.tenant.poolMax },
  })
  try {
    await db.raw('select 1')
  } catch (err) {
    await db.destroy().catch(() => {})
    logger.error(`Tenant ${code}: koneksi database gagal (${err.code || err.message})`)
    throw new AppError('TENANT_UNAVAILABLE')
  }
  return db
}

const load = async (code, allowInactive) => {
  const tenant = await getRegistry().resolve(code)
  if (!tenant) {
    await destroyPool(code)
    throw new AppError('INVALID_CLIENT_CODE')
  }
  const active = tenant.status === 'active'
  if (!active && !allowInactive) {
    await destroyPool(code)
    throw new AppError('CLIENT_INACTIVE')
  }

  const fp = fingerprint(tenant.connection)
  const existing = pools.get(code)
  if (existing && existing.fingerprint === fp) {
    existing.resolvedAt = Date.now()
    existing.active = active
    return existing
  }

  await destroyPool(code) // kredensial berubah
  await evictIfNeeded()
  const db = await connect(code, tenant)
  const entry = {
    db, fingerprint: fp, resolvedAt: Date.now(), lastUsedAt: Date.now(), name: tenant.name, active,
  }
  pools.set(code, entry)
  return entry
}

/**
 * knex instance milik client. Lempar INVALID_CLIENT_CODE / CLIENT_INACTIVE / TENANT_UNAVAILABLE.
 * allowInactive = true hanya untuk jalur internal (mis. migrasi client yang belum diaktifkan).
 */
const getDb = async (clientCode, { allowInactive = false } = {}) => {
  const code = normalizeCode(clientCode)
  if (!CODE_PATTERN.test(code)) throw new AppError('INVALID_CLIENT_CODE')

  const cached = pools.get(code)
  if (cached && Date.now() - cached.resolvedAt < config.tenant.resolveTtlMs) {
    if (!cached.active && !allowInactive) throw new AppError('CLIENT_INACTIVE')
    cached.lastUsedAt = Date.now()
    return cached.db
  }

  const pendingKey = `${code}:${allowInactive}`
  if (!pending.has(pendingKey)) {
    pending.set(pendingKey, load(code, allowInactive).finally(() => pending.delete(pendingKey)))
  }
  const entry = await pending.get(pendingKey)
  entry.lastUsedAt = Date.now()
  return entry.db
}

/** Nama perusahaan dari registry (untuk GET /config). */
const getTenantName = async (clientCode) => {
  const tenant = await getRegistry().resolve(normalizeCode(clientCode))
  return tenant ? tenant.name : null
}

/**
 * Kredensial untuk migrasi/seeder: role OWNER (boleh DDL, koneksi langsung ke Postgres), role app (untuk verifikasi),
 * dan akun sistem MSI. Tidak di-cache dan tidak boleh dipakai untuk request biasa.
 * @returns {Promise<object|null>} null jika client tidak dikenal
 */
const resolveProvisioning = (clientId) => getRegistry().resolveProvisioning(String(clientId))

const listCodes = () => getRegistry().listCodes()

/** Tutup pool tenant (mis. setelah migrasi/rotasi password) supaya koneksi berikutnya memakai kredensial terbaru. */
const closePool = (clientCode) => destroyPool(normalizeCode(clientCode))

const closeAll = async () => {
  await Promise.all([...pools.keys()].map(destroyPool))
}

module.exports = {
  getDb, getTenantName, resolveProvisioning, listCodes, closePool, closeAll, normalizeCode,
}
