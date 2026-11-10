const migrator = require('../../database/tenant/migrator')
const { AppError } = require('../../utils/errors')
const { ok } = require('../../utils/response')

// Untuk pemanggil internal, client code yang salah = 404 (bukan 401 seperti di login)
const notFoundIfUnknown = async (fn) => {
  try {
    return await fn()
  } catch (err) {
    if (err.code === 'INVALID_CLIENT_CODE') throw new AppError('NOT_FOUND', { details: { reason: 'client_code tidak dikenal' } })
    throw err
  }
}

const migrate = async (req, res) => ok(res, await notFoundIfUnknown(() => migrator.migrateLatest(req.valid.params.clientCode)))

const migrationStatus = async (req, res) => ok(res, await notFoundIfUnknown(() => migrator.getStatus(req.valid.params.clientCode)))

module.exports = { migrate, migrationStatus }
