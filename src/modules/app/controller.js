const service = require('./service')
const { ok } = require('../../utils/response')

const getPublicConfig = (req, res) => ok(res, service.getPublicConfig())

module.exports = { getPublicConfig }
