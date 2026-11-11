const crypto = require('crypto')
const tenant = require('../../database/tenant')
const { AppError } = require('../../utils/errors')
const { normalizePhone } = require('../../utils/phone')
const { getPending } = require('../sync/pending')
const tokens = require('./tokens')
const repo = require('./repository')

/**
 * Satu alur auth untuk dua peran, dibedakan oleh kolom users.role:
 *   driver -> aplikasi HP: wajib `device`, token membawa driver_id dan device_id, response berisi `driver`
 *   admin  -> web admin:   tanpa device, response berisi `admin`
 */
const isActive = (row) => row.user_status === 'active' && (row.role !== 'driver' || row.driver_status === 'active')

// Isi access token. device_id = baris devices (uuid) milik perangkat yang login (hanya driver)
const claimsOf = (user, deviceUuid = null) => (user.role === 'driver'
  ? { role: 'driver', driver_id: user.driver_id, device_id: deviceUuid }
  : { role: 'admin' })

const login = async ({
  client_code: clientCodeInput, username, password, device, remember_me: remember,
}) => {
  const clientCode = tenant.normalizeCode(clientCodeInput)
  const db = await tenant.getDb(clientCode) // INVALID_CLIENT_CODE / CLIENT_INACTIVE / TENANT_UNAVAILABLE

  const phone = normalizePhone(username)
  const user = await repo.findAccountForLogin(db, { phone, identifier: username })

  await tokens.verifyCredentials(db, user, password) // INVALID_CREDENTIALS / ACCOUNT_LOCKED
  if (!isActive(user)) throw new AppError('FORBIDDEN') // password benar, tapi akun dinonaktifkan

  // Driver login dari HP, jadi perangkatnya wajib dikenali (untuk token push, sync, dan pencabutan sesi per perangkat)
  if (user.role === 'driver' && !device) {
    throw new AppError('VALIDATION_ERROR', { details: [{ field: 'device', message: 'Data perangkat wajib diisi untuk login driver.' }] })
  }

  await repo.markLoginSuccess(db, user.id)
  const deviceRow = user.role === 'driver' ? await repo.upsertDevice(db, user.id, device) : null
  const issued = await tokens.issueTokens(db, {
    clientCode,
    userId: user.id,
    claims: claimsOf(user, deviceRow && deviceRow.id),
    deviceUuid: deviceRow ? deviceRow.id : null,
    familyId: crypto.randomUUID(),
    remember,
  })

  if (user.role === 'driver') {
    return {
      ...issued,
      driver: {
        id: user.driver_id, code: user.driver_code, name: user.name, phone: user.phone,
      },
    }
  }
  return {
    ...issued,
    admin: {
      id: user.id, username: user.username, name: user.name, email: user.email,
    },
  }
}

const refresh = ({ refresh_token: token }) => tokens.rotate(token, {
  loadUser: repo.findAccountById,
  isActive,
  claims: (user, stored) => claimsOf(user, stored.device_id),
})

/**
 * Driver: cabut token perangkat ini dan hapus token push-nya; beri peringatan jika masih ada data offline yang belum terkirim.
 * Admin: cabut rantai refresh token sesi ini (id rantai ada di access token, claim `fam`).
 */
const logout = async (db, auth) => {
  if (auth.role === 'admin') {
    if (auth.fam) await repo.revokeFamily(db, auth.fam)
    return { logged_out: true }
  }
  const pending = await getPending(db, auth.sub)
  await repo.revokeDeviceTokens(db, auth.sub, auth.device_id)
  await repo.clearFcmToken(db, auth.sub, auth.device_id)
  return { logged_out: true, pending_sync_warning: pending.length > 0 }
}

module.exports = { login, refresh, logout }
