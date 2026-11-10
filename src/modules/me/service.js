const { AppError } = require('../../utils/errors')
const { auditFields } = require('../../utils/audit')
const { wibDate, toWib } = require('../../utils/date')
const { getPending } = require('../sync/pending')
const repo = require('./repository')

const getMe = async (db, auth) => {
  const row = await repo.getProfile(db, auth.sub, auth.device_id)
  if (!row) throw new AppError('UNAUTHORIZED')

  const [unit, pending] = await Promise.all([repo.getUnitForDate(db, row.driver_id, wibDate()), getPending(db, auth.sub)])

  return {
    id: row.driver_id,
    code: row.code,
    name: row.name,
    phone: row.phone,
    unit_today: unit || null,
    settings: { language: row.language },
    app: { version: row.app_version },
    sync: { pending: pending.length, last_synced_at: toWib(row.last_synced_at) },
    ...auditFields(row),
  }
}

const updateSettings = async (db, auth, { language }) => {
  await repo.updateLanguage(db, auth.sub, language)
  return { language }
}

module.exports = { getMe, updateSettings }
