const crypto = require('crypto')
const bcrypt = require('bcrypt')
const config = require('../../config')
const tenant = require('../../database/tenant')
const { signAccessToken } = require('../../middlewares/auth')
const { AppError } = require('../../utils/errors')
const { normalizePhone } = require('../../utils/phone')
const { toWib } = require('../../utils/date')
const { getPending } = require('../sync/pending')
const repo = require('./repository')

// Dipakai agar waktu respons sama baik user ada maupun tidak (cegah enumerasi akun lewat timing)
const DUMMY_HASH = bcrypt.hashSync('timing-equalizer', 10)

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex')

/**
 * Refresh token = "<client_code base64url>.<48 byte acak>".
 * client_code ikut di token karena /auth/refresh tidak membawa access token,
 * padahal kita perlu tahu database client mana yang dicari.
 */
const buildRefreshToken = (clientCode) => (
  `${Buffer.from(clientCode).toString('base64url')}.${crypto.randomBytes(48).toString('base64url')}`
)

const parseRefreshToken = (token) => {
  const [prefix, secret] = String(token).split('.')
  if (!prefix || !secret) return null
  try {
    return Buffer.from(prefix, 'base64url').toString('utf8')
  } catch (err) {
    return null
  }
}

const assertActive = (row) => {
  if (row.user_status !== 'active' || row.driver_status !== 'active') throw new AppError('FORBIDDEN')
}

const issueTokens = async (db, {
  clientCode, user, deviceUuid, familyId, remember
}) => {
  const refreshToken = buildRefreshToken(clientCode)
  const ttl = remember ? config.jwt.refreshTokenTtl : config.jwt.refreshTokenTtlShort

  await repo.insertRefreshToken(db, {
    user_id: user.id,
    device_id: deviceUuid,
    family_id: familyId,
    token_hash: sha256(refreshToken),
    expires_at: new Date(Date.now() + ttl * 1000),
  })

  const accessToken = signAccessToken({
    sub: user.id,
    role: 'driver',
    driver_id: user.driver_id,
    client_code: clientCode,
    device_id: deviceUuid,
  })

  return { access_token: accessToken, refresh_token: refreshToken, expires_in: config.jwt.accessTokenTtl }
}

const login = async ({
  client_code: clientCodeInput, username, password, device, remember_me: remember,
}) => {
  const clientCode = tenant.normalizeCode(clientCodeInput)
  const db = await tenant.getDb(clientCode) // INVALID_CLIENT_CODE / CLIENT_INACTIVE / TENANT_UNAVAILABLE

  const phone = normalizePhone(username)
  const user = await repo.findDriverUser(db, phone ? { phone } : { username })

  if (!user) {
    await bcrypt.compare(password, DUMMY_HASH)
    throw new AppError('INVALID_CREDENTIALS')
  }

  if (user.locked_until && new Date(user.locked_until) > new Date()) {
    throw new AppError('ACCOUNT_LOCKED', { details: { locked_until: toWib(user.locked_until) } })
  }

  const passwordOk = await bcrypt.compare(password, user.password_hash)
  if (!passwordOk) {
    const failed = await repo.incrementFailedLogin(db, user.id)
    const remaining = config.auth.maxLoginAttempts - failed
    if (remaining <= 0) {
      const until = new Date(Date.now() + config.auth.lockMinutes * 60 * 1000)
      await repo.lockUser(db, user.id, until)
      throw new AppError('ACCOUNT_LOCKED', { details: { locked_until: toWib(until) } })
    }
    throw new AppError('INVALID_CREDENTIALS', { details: { remaining_attempts: remaining } })
  }

  assertActive(user) // password benar tapi akun dinonaktifkan admin

  await repo.markLoginSuccess(db, user.id)
  const deviceRow = await repo.upsertDevice(db, user.id, device)
  const tokens = await issueTokens(db, {
    clientCode, user, deviceUuid: deviceRow.id, familyId: crypto.randomUUID(), remember,
  })

  return {
    ...tokens,
    driver: {
      id: user.driver_id, code: user.driver_code, name: user.name, phone: user.phone
    },
  }
}

const refresh = async ({ refresh_token: token }) => {
  const clientCode = parseRefreshToken(token)
  if (!clientCode) throw new AppError('UNAUTHORIZED')

  let db
  try {
    db = await tenant.getDb(clientCode)
  } catch (err) {
    if (err.code === 'INVALID_CLIENT_CODE') throw new AppError('UNAUTHORIZED')
    throw err
  }

  const stored = await repo.findRefreshTokenByHash(db, sha256(token))
  if (!stored) throw new AppError('UNAUTHORIZED')

  // Token yang sudah dirotasi dipakai lagi = kemungkinan dicuri -> cabut seluruh rantai
  if (stored.revoked_at) {
    await repo.revokeFamily(db, stored.family_id)
    throw new AppError('UNAUTHORIZED')
  }
  if (new Date(stored.expires_at) <= new Date()) throw new AppError('UNAUTHORIZED')

  const user = await repo.findDriverUserById(db, stored.user_id)
  if (!user || user.user_status !== 'active' || user.driver_status !== 'active') {
    await repo.revokeFamily(db, stored.family_id)
    throw new AppError('UNAUTHORIZED')
  }

  // Pilihan "ingat saya" dipertahankan: TTL rantai dibaca dari umur token lama
  const remember = (stored.expires_at - stored.created_at) / 1000 > config.jwt.refreshTokenTtlShort

  return db.transaction(async (trx) => {
    const tokens = await issueTokens(trx, {
      clientCode, user, deviceUuid: stored.device_id, familyId: stored.family_id, remember,
    })
    const newRow = await repo.findRefreshTokenByHash(trx, sha256(tokens.refresh_token))
    await repo.revokeRefreshToken(trx, stored.id, newRow.id)
    return tokens
  })
}

const logout = async (db, auth) => {
  // Ada item sync yang gagal dan belum terkirim: aplikasi diminta memperingatkan driver sebelum data di HP hilang
  const pending = await getPending(db, auth.sub)
  await repo.revokeDeviceTokens(db, auth.sub, auth.device_id)
  await repo.clearFcmToken(db, auth.sub, auth.device_id)
  return { logged_out: true, pending_sync_warning: pending.length > 0 }
}

module.exports = { login, refresh, logout }
