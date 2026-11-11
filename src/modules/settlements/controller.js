const service = require('./service')
const { ok } = require('../../utils/response')

const list = async (req, res) => {
  const { data, meta } = await service.list(req.db, req.valid.query)
  return ok(res, data, { meta })
}

const get = async (req, res) => ok(res, await service.get(req.db, req.valid.params.id))

const settle = async (req, res) => ok(res, await service.settle(req.db, req.admin, req.valid.params.id, req.body))

module.exports = { list, get, settle }
