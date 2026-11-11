const crypto = require('crypto')
const bcrypt = require('bcrypt')
const config = require('../../config')
const tenant = require('../../database/tenant')
const { signAccessToken } = require('../../middlewares/auth')
const { AppError } = require('../../utils/errors')
const { toWib } = require('../../utils/date')
const repo = require('./repository')

/**
 * Logika token & verifikasi kredensial yang dipakai bersama oleh login driver (aplikasi HP) dan login admin.
 * Masing-masing hanya berbeda pada cara mencari user dan isi claims token.
 */

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

/**
 * Cek password. Lempar INVALID_CREDENTIALS (user tidak ada / password salah, dengan sisa percobaan) atau
 * ACCOUNT_LOCKED (terkunci sementara setelah terlalu banyak salah). `user` boleh undefined.
 */
const verifyCredentials = async (db, user, password) => {
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
}

/**
 * Terbitkan access + refresh token.
 * @param {object} claims  isi tambahan access token (mis. { role, driver_id, device_id })
 */
const issueTokens = async (db, {
  clientCode, userId, claims, deviceUuid = null, familyId, remember,
}) => {
  const refreshToken = buildRefreshToken(clientCode)
  const ttl = remember ? config.jwt.refreshTokenTtl : config.jwt.refreshTokenTtlShort

  await repo.insertRefreshToken(db, {
    user_id: userId,
    device_id: deviceUuid,
    family_id: familyId,
    token_hash: sha256(refreshToken),
    expires_at: new Date(Date.now() + ttl * 1000),
  })

  const accessToken = signAccessToken({
    sub: userId, client_code: clientCode, fam: familyId, ...claims,
  })
  return { access_token: accessToken, refresh_token: refreshToken, expires_in: config.jwt.accessTokenTtl }
}

/**
 * Tukar refresh token dengan pasangan token baru (rotasi). Token lama langsung tidak berlaku;
 * token yang sudah dirotasi dipakai lagi dianggap dicuri dan seluruh rantainya dicabut.
 *
 * @param {object} hooks
 * @param {(db, userId) => Promise<object|undefined>} hooks.loadUser  cari user menurut peran; undefined = bukan peran ini
 * @param {(user) => boolean} hooks.isActive
 * @param {(user, stored) => object} hooks.claims  isi access token baru
 */
const rotate = async (token, { loadUser, isActive, claims }) => {
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

  if (stored.revoked_at) {
    await repo.revokeFamily(db, stored.family_id)
    throw new AppError('UNAUTHORIZED')
  }
  if (new Date(stored.expires_at) <= new Date()) throw new AppError('UNAUTHORIZED')

  const user = await loadUser(db, stored.user_id)
  if (!user || !isActive(user)) {
    await repo.revokeFamily(db, stored.family_id)
    throw new AppError('UNAUTHORIZED')
  }

  // Pilihan "ingat saya" dipertahankan: TTL rantai dibaca dari umur token lama
  const remember = (stored.expires_at - stored.created_at) / 1000 > config.jwt.refreshTokenTtlShort

  return db.transaction(async (trx) => {
    const tokens = await issueTokens(trx, {
      clientCode,
      userId: user.id,
      claims: claims(user, stored),
      deviceUuid: stored.device_id,
      familyId: stored.family_id,
      remember,
    })
    const newRow = await repo.findRefreshTokenByHash(trx, sha256(tokens.refresh_token))
    await repo.revokeRefreshToken(trx, stored.id, newRow.id)
    return tokens
  })
}

module.exports = {
  verifyCredentials, issueTokens, rotate, sha256,
}
