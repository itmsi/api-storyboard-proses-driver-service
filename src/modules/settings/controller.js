const service = require('./service')
const ai = require('./ai')
const { ok } = require('../../utils/response')

const get = async (req, res) => ok(res, await service.get(req.db))

const update = async (req, res) => ok(res, await service.update(req.db, req.admin, req.body))

const aiStatus = async (req, res) => ok(res, await ai.status(req.db))

const aiUpdate = async (req, res) => ok(res, await ai.update(req.db, req.admin, req.body))

const aiCheck = async (req, res) => ok(res, await ai.check(req.db))

module.exports = {
  get, update, aiStatus, aiUpdate, aiCheck,
}
