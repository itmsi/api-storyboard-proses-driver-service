const service = require('./service')
const { ok } = require('../../utils/response')

const get = async (req, res) => ok(res, await service.get(req.db))

const update = async (req, res) => ok(res, await service.update(req.db, req.admin, req.body))

module.exports = { get, update }
