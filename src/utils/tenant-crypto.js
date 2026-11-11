/**
 * Dekripsi/enkripsi password DB tenant yang dikirim saas-api (role owner, role app, system user).
 *
 * Algoritma : AES-256-GCM
 * Key       : TENANT_DB_ENC_KEY = 32 byte, ditulis base64 (44 karakter) atau hex (64 karakter); sama dengan di saas-api
 * Format    : base64( iv[12] | authTag[16] | ciphertext )
 *
 * Mengikuti saas-api/src/lib/crypto.js. Hanya `decrypt` dipakai API ini; `encrypt` ada untuk test (saas-api tiruan).
 */
const crypto = require('crypto')
const config = require('../config')
const logger = require('./logger')

let cachedKey

const parseKey = (raw) => {
  if (/^[0-9a-f]{64}$/i.test(raw)) return Buffer.from(raw, 'hex')
  const buf = Buffer.from(raw, 'base64')
  if (buf.length === 32) return buf
  throw new Error('TENANT_DB_ENC_KEY harus 32 byte (base64 44 karakter atau hex 64 karakter)')
}

const getKey = () => {
  if (cachedKey) return cachedKey
  if (config.tenant.encKey) {
    cachedKey = parseKey(config.tenant.encKey)
  } else if (config.app.isProduction) {
    throw new Error('TENANT_DB_ENC_KEY wajib diisi di production')
  } else {
    // Sama dengan perilaku saas-api: tanpa key, dev memakai key bawaan yang sama supaya kedua project bisa saling bicara
    logger.warn('TENANT_DB_ENC_KEY kosong, memakai key development (JANGAN dipakai di production)')
    cachedKey = crypto.createHash('sha256').update('dev-only-tenant-db-key').digest()
  }
  return cachedKey
}

const encrypt = (plain) => {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', getKey(), iv)
  const ct = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()])
  return Buffer.concat([iv, cipher.getAuthTag(), ct]).toString('base64')
}

const decrypt = (encoded) => {
  const buf = Buffer.from(encoded, 'base64')
  const decipher = crypto.createDecipheriv('aes-256-gcm', getKey(), buf.subarray(0, 12))
  decipher.setAuthTag(buf.subarray(12, 28))
  return Buffer.concat([decipher.update(buf.subarray(28)), decipher.final()]).toString('utf8')
}

module.exports = { encrypt, decrypt }
