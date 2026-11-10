const knexfile = require('../knexfile')
const logger = require('../../utils/logger')
const { AppError } = require('../../utils/errors')
const tenant = require('./index')

/**
 * Migrasi skema pada database client. Dipakai script CLI (migrate-tenant.js) dan endpoint
 * internal (POST /api/v1/internal/tenants/:clientCode/migrate) supaya perilakunya sama.
 *
 * - Aman dipanggil berulang (idempoten): tidak ada migrasi baru = tidak melakukan apa-apa.
 * - Satu migrasi per client pada satu waktu: kunci di proses ini + kunci tabel knex_migrations_lock di database
 *   (melindungi jika API berjalan di beberapa instance).
 * - Client yang belum aktif tetap boleh dimigrasi (project manage company biasanya migrasi dulu, baru aktifkan).
 */
const running = new Set()

const names = (list) => list.map((m) => (typeof m === 'string' ? m : m.name || m.file))

const getStatus = async (clientCode) => {
  const code = tenant.normalizeCode(clientCode)
  const db = await tenant.getDb(code, { allowInactive: true })
  const [completed, pendingList] = await db.migrate.list(knexfile.migrations)
  const pending = names(pendingList)
  const done = names(completed)
  return {
    client_code: code,
    up_to_date: pending.length === 0,
    current_version: done.length ? done[done.length - 1] : null,
    applied_count: done.length,
    pending,
  }
}

const migrateLatest = async (clientCode) => {
  const code = tenant.normalizeCode(clientCode)
  const db = await tenant.getDb(code, { allowInactive: true })

  if (running.has(code)) throw new AppError('MIGRATION_IN_PROGRESS')
  running.add(code)
  try {
    const [batch, applied] = await db.migrate.latest(knexfile.migrations)
    if (applied.length) logger.info(`Tenant ${code}: migrasi batch ${batch} selesai (${applied.length} file)`)
    return { client_code: code, batch, applied: names(applied) }
  } catch (err) {
    if (/lock/i.test(err.message)) throw new AppError('MIGRATION_IN_PROGRESS')
    logger.error(`Tenant ${code}: migrasi gagal: ${err.stack || err.message}`)
    throw new AppError('MIGRATION_FAILED', { details: { reason: err.message } })
  } finally {
    running.delete(code)
  }
}

module.exports = { getStatus, migrateLatest }
