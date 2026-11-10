const service = require('./service')
const { ok } = require('../../utils/response')

const registerPushToken = async (req, res) => ok(res, await service.registerPushToken(req.db, req.auth, req.body))

module.exports = { registerPushToken }
