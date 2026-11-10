const service = require('./service')
const { ok } = require('../../utils/response')

const getMe = async (req, res) => ok(res, await service.getMe(req.db, req.auth))

const updateSettings = async (req, res) => ok(res, await service.updateSettings(req.db, req.auth, req.body))

module.exports = { getMe, updateSettings }
