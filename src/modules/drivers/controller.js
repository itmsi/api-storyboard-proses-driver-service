const service = require('./service')
const { ok, saved } = require('../../utils/response')

const list = async (req, res) => {
  const { data, meta } = await service.list(req.db, req.body)
  return ok(res, data, { meta })
}

const get = async (req, res) => ok(res, await service.get(req.db, req.valid.params.id))

// Password awal yang dibuat sistem hanya tampil sekali, jadi tetap dikembalikan di data
const create = async (req, res) => {
  const { initial_password: initialPassword } = await service.create(req.db, req.admin, req.body)
  return saved(res, 'Driver berhasil dibuat.', { status: 201, data: initialPassword ? { initial_password: initialPassword } : {} })
}

const update = async (req, res) => {
  await service.update(req.db, req.admin, req.valid.params.id, req.body)
  return saved(res, 'Driver berhasil diperbarui.')
}

const resetPassword = async (req, res) => ok(res, await service.resetPassword(req.db, req.admin, req.valid.params.id, req.body))

const unlock = async (req, res) => ok(res, await service.unlock(req.db, req.admin, req.valid.params.id))

const remove = async (req, res) => ok(res, await service.remove(req.db, req.admin, req.valid.params.id))

module.exports = {
  list, get, create, update, resetPassword, unlock, remove,
}
