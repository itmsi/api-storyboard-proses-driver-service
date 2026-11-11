const service = require('./service')
const { ok } = require('../../utils/response')

const getTemplate = async (req, res) => ok(res, await service.getTemplate(req.db))

const getToday = async (req, res) => ok(res, await service.getToday(req.db, req.auth, req.valid.params.unitId))

const submit = async (req, res) => {
  const { inspection, created } = await service.submit(req.db, req.auth, req.valid.params.unitId, req.body)
  return ok(res, service.summarize(inspection), { status: created ? 201 : 200 })
}

const recheck = async (req, res) => ok(res, await service.recheck(req.db, req.admin, req.valid.params.unitId, req.body))

const list = async (req, res) => {
  const { data, meta } = await service.list(req.db, req.body)
  return ok(res, data, { meta })
}

const get = async (req, res) => ok(res, await service.getById(req.db, req.valid.params.id))

const update = async (req, res) => ok(res, await service.update(req.db, req.admin, req.valid.params.id, req.body))

const remove = async (req, res) => ok(res, await service.remove(req.db, req.admin, req.valid.params.id))

module.exports = {
  getTemplate, getToday, submit, recheck, list, get, update, remove,
}
