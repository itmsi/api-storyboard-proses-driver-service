const service = require('./service')
const { ok } = require('../../utils/response')

const login = async (req, res) => ok(res, await service.login(req.body))

const refresh = async (req, res) => ok(res, await service.refresh(req.body))

const logout = async (req, res) => ok(res, await service.logout(req.db, req.auth))

module.exports = { login, refresh, logout }
