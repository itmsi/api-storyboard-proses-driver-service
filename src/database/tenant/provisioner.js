const fs = require('fs')
const knex = require('knex')
const logger = require('../../utils/logger')
const { AppError } = require('../../utils/errors')
const knexfile = require('../knexfile')
const tenant = require('./index')
const { upsertSystemUser } = require('./system-user')
const { ensureDefaultRoles } = require('./default-roles')

/**
 * Operasi yang dipanggil saas-worker saat membuat client baru (dan saat rollout migrasi):
 *   migrate -> seed -> verify (dan reset system user)
 *
 * Database client sudah dibuat saas-worker (role owner + role app + database kosong). API ini hanya mengisinya.
 * - migrate / seed memakai role OWNER (boleh DDL), koneksi langsung dan sementara; tidak lewat pool tenant biasa.
 * - verify memakai role APP, sehingga sekaligus membuktikan hak DML-nya cukup.
 * - Kredensial tidak pernah dicatat di log atau pesan error.
 */

// Tabel inti yang harus ada setelah migrasi (verifikasi); migrasi terbaru dicek terpisah
const CORE_TABLES = [
  'users', 'drivers', 'devices', 'refresh_tokens', 'app_settings', 'unit_types', 'units', 'driver_unit_assignments', 'customers', 'locations',
  'delivery_orders', 'delivery_order_events', 'media', 'p2h_check_items', 'p2h_inspections', 'expense_categories', 'expenses', 'loadings',
  'odometer_readings', 'handovers', 'settlements', 'sync_items',
]

const running = new Set() // client yang sedang dimigrasi di proses ini

const open = (connection, name) => knex({
  client: 'pg',
  connection: { application_name: name, ...connection },
  pool: { min: 0, max: 2 },
})

const withDb = async (connection, name, fn) => {
  const db = open(connection, name)
  try {
    return await fn(db)
  } finally {
    await db.destroy().catch(() => {})
  }
}

const strip = (name) => name.replace(/\.js$/, '')
const names = (list) => list.map((m) => strip(typeof m === 'string' ? m : m.name || m.file))

/** Semua file migrasi yang dikenal API ini, urut. */
const migrationFiles = () => fs.readdirSync(knexfile.migrations.directory).filter((f) => f.endsWith('.js')).sort().map(strip)

const latestVersion = () => {
  const files = migrationFiles()
  return files[files.length - 1] || null
}

const status = () => {
  const migrations = migrationFiles()
  return { latest_version: latestVersion(), count: migrations.length, migrations }
}

const requireTenant = async (clientId) => {
  const found = await tenant.resolveProvisioning(clientId)
  if (!found) throw new AppError('NOT_FOUND', { details: { client_id: clientId, reason: 'client tidak dikenal atau belum bisa diprovisioning' } })
  return found
}

const migrate = async (clientId) => {
  if (running.has(clientId)) throw new AppError('TENANT_LOCKED')
  running.add(clientId) // sebelum await pertama, supaya dua request bersamaan tidak lolos keduanya
  const started = Date.now()
  let found = { code: clientId }
  try {
    found = await requireTenant(clientId)
    const result = await withDb(found.owner, 'api-ogo-migrate', async (db) => {
      const [, applied] = await db.migrate.latest(knexfile.migrations)
      const [completed] = await db.migrate.list(knexfile.migrations)
      const done = names(completed)
      return { applied: names(applied), schemaVersion: done[done.length - 1] || null }
    })
    // Skema berubah: pool app tenant ini ditutup supaya koneksi berikutnya segar
    await tenant.closePool(found.code)
    logger.info(`Tenant ${found.code}: migrasi selesai (${result.applied.length} file, versi ${result.schemaVersion})`)
    return { schema_version: result.schemaVersion, applied: result.applied, duration_ms: Date.now() - started }
  } catch (err) {
    if (err instanceof AppError) throw err // mis. NOT_FOUND / TENANT_UNAVAILABLE dari registry
    // knex menahan kunci migrasi di database: dua migrasi bersamaan (mis. dua instance API) -> yang kedua ditolak
    if (/lock/i.test(err.message) && !/permission|denied/i.test(err.message)) throw new AppError('TENANT_LOCKED')
    logger.error(`Tenant ${found.code}: migrasi gagal: ${err.message}`)
    throw new AppError('MIGRATION_FAILED', { details: { reason: String(err.message).slice(0, 500), pg_code: err.code || null } })
  } finally {
    running.delete(clientId)
  }
}

/**
 * Seeder idempoten. Data acuan (checklist P2H, kategori biaya) sudah dibuat oleh migrasi, jadi seeder hanya
 * menyiapkan role bawaan (Administrator dan Driver dengan default permission) dan, bila diminta, akun sistem MSI.
 */
const seed = async (clientId, { includeSystemUser }) => {
  const found = await requireTenant(clientId)
  const started = Date.now()
  const seeded = []

  if (includeSystemUser && !found.systemUser) {
    throw new AppError('VALIDATION_ERROR', { details: [{ field: 'include_system_user', message: 'System user belum dikonfigurasi untuk client ini di saas-api.' }] })
  }

  try {
    await withDb(found.owner, 'api-ogo-seed', async (db) => {
      // Role bawaan (Administrator, Driver dengan default permission) selalu disiapkan, lalu akun sistem bila diminta
      await ensureDefaultRoles(db)
      seeded.push('default_roles')
      if (includeSystemUser) {
        const { action } = await upsertSystemUser(db, found.systemUser)
        seeded.push(`system_user:${action}`)
      }
    })
  } catch (err) {
    if (err.code === '42P01') { // tabel belum ada
      throw new AppError('INVALID_STATE', { message: 'Database belum dimigrasi. Jalankan migrasi dulu.', details: { reason: 'belum_dimigrasi' } })
    }
    throw err
  }
  return { seeded, duration_ms: Date.now() - started }
}

/**
 * Verifikasi read-only dengan role APP: bisa login, semua tabel inti ada, semua migrasi sudah jalan, dan akun sistem ada.
 * `system_user` bernilai null jika client tidak punya akun sistem (tidak memblokir `ok`).
 */
const verify = async (clientId) => {
  const found = await requireTenant(clientId)
  const checks = {
    app_role_login: false, migrations_up_to_date: false, tables: false, system_user: found.systemUser ? false : null,
  }
  let schemaVersion = null

  try {
    await withDb(found.app, 'api-ogo-verify', async (db) => {
      await db.raw('select 1')
      checks.app_role_login = true

      const tables = await db('information_schema.tables').where({ table_schema: 'public' }).whereIn('table_name', CORE_TABLES).pluck('table_name')
      checks.tables = CORE_TABLES.every((t) => tables.includes(t))

      const applied = new Set(names(await db('knex_migrations').select('name').then((rows) => rows.map((r) => r.name))))
      const files = migrationFiles()
      checks.migrations_up_to_date = files.every((f) => applied.has(f))
      schemaVersion = files.filter((f) => applied.has(f)).pop() || null

      if (found.systemUser) {
        const row = await db('users')
          .where({ is_system: true, is_delete: false, status: 'active' })
          .whereRaw('lower(username) = lower(?)', [found.systemUser.username])
          .first('id')
        checks.system_user = Boolean(row)
      }
    })
  } catch (err) {
    // Gagal di tengah (mis. tabel belum ada): sisa pemeriksaan tetap false; hanya kode Postgres yang dicatat
    logger.warn(`Tenant ${found.code}: verifikasi berhenti (${err.code || err.message})`)
  }

  const ok = Object.values(checks).every((v) => v === true || v === null)
  return { ok, schema_version: schemaVersion, checks }
}

/** Setel ulang password akun sistem sesuai nilai terbaru di saas-api, dan cabut sesi lamanya. */
const resetSystemUser = async (clientId) => {
  const found = await requireTenant(clientId)
  if (!found.systemUser) {
    throw new AppError('VALIDATION_ERROR', { details: [{ field: 'system_user', message: 'System user belum dikonfigurasi untuk client ini di saas-api.' }] })
  }
  await withDb(found.owner, 'api-ogo-system-user', (db) => upsertSystemUser(db, found.systemUser))
  return { ok: true }
}

module.exports = {
  migrate, seed, verify, resetSystemUser, status, latestVersion, CORE_TABLES,
}
