const crypto = require('crypto')
const bcrypt = require('bcrypt')
const Joi = require('joi')
const config = require('../config')

const MIN_LENGTH = 8

/** Aturan password akun yang dibuat/diubah admin: minimal 8 karakter, ada huruf dan angka. */
const passwordRule = Joi.string().min(MIN_LENGTH).max(128)
  .pattern(/[A-Za-z]/)
  .pattern(/\d/)
  .messages({
    'string.min': `Password minimal ${MIN_LENGTH} karakter.`,
    'string.pattern.base': 'Password harus mengandung huruf dan angka.',
  })

const hash = (plain) => bcrypt.hash(plain, config.auth.bcryptRounds)

// Tanpa karakter yang mudah tertukar (0/O, 1/l/I) karena password sementara dibacakan/diketik manual oleh driver
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'

/** Password sementara acak (10 karakter, dijamin ada huruf dan angka). */
const generate = (length = 10) => {
  const pick = (chars) => chars[crypto.randomInt(chars.length)]
  let out = pick('ABCDEFGHJKMNPQRSTUVWXYZ') + pick('abcdefghijkmnpqrstuvwxyz') + pick('23456789')
  while (out.length < length) out += pick(ALPHABET)
  const chars = out.split('')
  for (let i = chars.length - 1; i > 0; i -= 1) { // Fisher-Yates: acak urutan
    const j = crypto.randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]]
  }
  return chars.join('')
}

module.exports = {
  passwordRule, hash, generate, MIN_LENGTH,
}
