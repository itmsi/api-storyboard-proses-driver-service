const service = require('./service')
const { ok } = require('../../utils/response')

const getLoading = async (req, res) => ok(res, await service.getLoading(req.db, req.auth, req.valid.params.id))

const getOdometer = async (req, res) => ok(res, await service.getOdometer(req.db, req.auth, req.valid.params.id))

const getHandover = async (req, res) => ok(res, await service.getHandover(req.db, req.auth, req.valid.params.id))

module.exports = { getLoading, getOdometer, getHandover }
