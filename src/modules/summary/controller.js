const service = require('./service')
const { ok } = require('../../utils/response')

const getSummary = async (req, res) => ok(res, await service.getSummary(req.db, req.auth, req.valid.params.id))

const complete = async (req, res) => {
  const { result } = await service.complete(req.db, req.auth, req.valid.params.id, req.body)
  return ok(res, result)
}

module.exports = { getSummary, complete }
