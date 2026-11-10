const service = require('./service')
const { ok } = require('../../utils/response')

const create = async (req, res) => {
  const { result, created } = await service.create(req.db, req.auth, req.valid.params.id, req.body)
  return ok(res, result, { status: created ? 201 : 200 })
}

module.exports = { create }
