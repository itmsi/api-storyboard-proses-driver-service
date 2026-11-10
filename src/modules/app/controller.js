const service = require('./service')
const { ok } = require('../../utils/response')

const getPublicConfig = (req, res) => ok(res, service.getPublicConfig())

const getConfig = async (req, res) => ok(res, await service.getConfig(req.db, req.auth))

const getBootstrap = async (req, res) => ok(res, await service.getBootstrap(req.db, req.auth))

module.exports = { getPublicConfig, getConfig, getBootstrap }
