const service = require('./service')
const { ok } = require('../../utils/response')

const getTemplate = async (req, res) => ok(res, await service.getTemplate(req.db))

const getToday = async (req, res) => ok(res, await service.getToday(req.db, req.auth, req.valid.params.unitId))

const submit = async (req, res) => {
  const { inspection, created } = await service.submit(req.db, req.auth, req.valid.params.unitId, req.body)
  return ok(res, service.summarize(inspection), { status: created ? 201 : 200 })
}

module.exports = { getTemplate, getToday, submit }
