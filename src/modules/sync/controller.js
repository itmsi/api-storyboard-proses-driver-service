const service = require('./service')
const { ok } = require('../../utils/response')
const { resolveLocale } = require('../../lang')

const batch = async (req, res) => {
  const { results, meta } = await service.processBatch(req.db, req.auth, req.body, resolveLocale(req.headers['accept-language']))
  return ok(res, { results }, { meta })
}

module.exports = { batch }
