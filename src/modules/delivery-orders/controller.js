const service = require('./service')
const { ok } = require('../../utils/response')

const list = async (req, res) => {
  const { data, meta } = await service.listAssigned(req.db, req.auth, req.valid.query.status)
  return ok(res, data, { meta })
}

const active = async (req, res) => {
  const { data, meta } = await service.listActive(req.db, req.auth)
  return ok(res, data, { meta })
}

const history = async (req, res) => {
  const { data, meta } = await service.history(req.db, req.auth, req.valid.query)
  return ok(res, data, { meta })
}

const getById = async (req, res) => ok(res, await service.getById(req.db, req.auth, req.valid.params.id))

const accept = async (req, res) => {
  const { result } = await service.accept(req.db, req.auth, req.valid.params.id, req.body)
  return ok(res, result)
}

module.exports = {
  list, active, history, getById, accept,
}
