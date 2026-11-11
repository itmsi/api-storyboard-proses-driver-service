const service = require('./service')
const { ok } = require('../../utils/response')

const list = async (req, res) => {
  const { data, meta } = await service.list(req.db, req.body)
  return ok(res, data, { meta })
}

const get = async (req, res) => ok(res, await service.get(req.db, req.valid.params.id))

const assign = async (req, res) => {
  const { result, created } = await service.assign(req.db, req.admin, req.body)
  return ok(res, result, { status: created ? 201 : 200 })
}

const remove = async (req, res) => ok(res, await service.remove(req.db, req.admin, req.valid.params.id))

module.exports = {
  list, get, assign, remove,
}
