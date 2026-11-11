const service = require('./service')
const { ok } = require('../../utils/response')

const list = async (req, res) => {
  const { data, meta } = await service.list(req.db, req.valid.query)
  return ok(res, data, { meta })
}

const get = async (req, res) => ok(res, await service.get(req.db, req.valid.params.id))

const create = async (req, res) => ok(res, await service.create(req.db, req.admin, req.body), { status: 201 })

const update = async (req, res) => ok(res, await service.update(req.db, req.admin, req.valid.params.id, req.body))

const resetPassword = async (req, res) => ok(res, await service.resetPassword(req.db, req.admin, req.valid.params.id, req.body))

const unlock = async (req, res) => ok(res, await service.unlock(req.db, req.admin, req.valid.params.id))

const remove = async (req, res) => ok(res, await service.remove(req.db, req.admin, req.valid.params.id))

module.exports = {
  list, get, create, update, resetPassword, unlock, remove,
}
