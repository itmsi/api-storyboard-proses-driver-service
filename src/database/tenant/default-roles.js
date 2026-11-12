const permissions = require('../../utils/permissions')

/**
 * Seeder default role (idempoten), dijalankan oleh migrasi/seed dev dan POST /internal/tenants/{id}/seed:
 *  - Administrator (user_type admin): semua hak, tidak bisa diubah.
 *  - Driver (user_type driver): default permission driver.
 * Tidak menimpa perubahan admin: pada role Driver yang sudah ada hanya modul yang belum tercatat yang ditambahkan
 * (mis. modul driver baru dari versi kode terbaru).
 *
 * @returns {Promise<{ administratorId: string, driverId: string }>}
 */
const ensureDefaultRoles = async (db) => {
  let administrator = await db('roles').where({ is_system: true, user_type: 'admin', is_delete: false }).first('id')
  if (!administrator) {
    [administrator] = await db('roles').insert({
      code: 'administrator', name: 'Administrator', description: 'Akses penuh ke semua modul', is_system: true, user_type: 'admin', permissions: '{}',
    }).returning('id')
  }

  const defaults = permissions.driverDefaults()
  let driver = await db('roles').where({ is_system: true, user_type: 'driver', is_delete: false }).first('id', 'permissions')
  if (!driver) {
    [driver] = await db('roles').insert({
      code: 'driver', name: 'Driver', description: 'Akun driver (aplikasi HP) dengan hak bawaan', is_system: true, user_type: 'driver', permissions: JSON.stringify(defaults),
    }).returning('id')
  } else {
    const current = driver.permissions || {}
    const missing = Object.keys(defaults).filter((key) => !(key in current))
    if (missing.length) {
      const merged = { ...current, ...Object.fromEntries(missing.map((key) => [key, defaults[key]])) }
      await db('roles').where({ id: driver.id }).update({ permissions: JSON.stringify(merged) })
    }
  }
  return { administratorId: administrator.id, driverId: driver.id }
}

module.exports = { ensureDefaultRoles }
