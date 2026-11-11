const service = require('./service')
const { ok } = require('../../utils/response')

const list = async (req, res) => {
  const { data, meta } = await service.list(req.db, req.body)
  return ok(res, data, { meta })
}

const get = async (req, res) => ok(res, await service.get(req.db, req.valid.params.code))

const create = async (req, res) => ok(res, await service.create(req.db, req.admin, req.body), { status: 201 })

const update = async (req, res) => ok(res, await service.update(req.db, req.admin, req.valid.params.code, req.body))

module.exports = {
  list, get, create, update,
}
