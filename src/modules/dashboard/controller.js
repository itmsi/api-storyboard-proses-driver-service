const service = require('./service')
const { ok } = require('../../utils/response')

const get = async (req, res) => {
  const { data, meta } = await service.get(req.db, req.body)
  return ok(res, data, { meta })
}

module.exports = { get }
