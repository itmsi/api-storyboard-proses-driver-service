const { AppError } = require('./errors')
const { normalizePhone } = require('./phone')

/**
 * Pemeriksaan keunikan data akun (tabel users) yang dipakai API admin untuk driver maupun admin.
 * Semua melempar VALIDATION_ERROR dengan nama field, supaya form admin bisa menampilkan pesan di kolom yang tepat.
 * `exceptUserId` = akun yang sedang diubah (tidak dianggap bentrok dengan dirinya sendiri).
 */
const fail = (field, message) => new AppError('VALIDATION_ERROR', { details: [{ field, message }] })

const taken = async (db, column, value, exceptUserId, lower = false) => {
  const q = db('users').where({ is_delete: false })
  if (lower) q.whereRaw(`lower(${column}) = lower(?)`, [value])
  else q.where(column, value)
  if (exceptUserId) q.whereNot({ id: exceptUserId })
  return Boolean(await q.first('id'))
}

/** Nomor HP -> E.164 (+62…). Kosong = null. Salah format atau sudah dipakai akun lain = error. */
const ensurePhone = async (db, input, exceptUserId = null) => {
  if (input === undefined || input === null || input === '') return null
  const phone = normalizePhone(input)
  if (!phone) throw fail('phone', 'Format No. HP tidak valid.')
  if (await taken(db, 'phone', phone, exceptUserId)) throw fail('phone', 'No. HP sudah dipakai akun lain.')
  return phone
}

const ensureEmail = async (db, input, exceptUserId = null) => {
  if (input === undefined || input === null || input === '') return null
  const email = String(input).trim().toLowerCase()
  if (await taken(db, 'email', email, exceptUserId, true)) throw fail('email', 'Email sudah dipakai akun lain.')
  return email
}

const ensureUsername = async (db, input, exceptUserId = null) => {
  if (await taken(db, 'username', input, exceptUserId, true)) throw fail('username', 'Username sudah dipakai akun lain.')
  return input
}

module.exports = {
  ensurePhone, ensureEmail, ensureUsername, fail,
}
