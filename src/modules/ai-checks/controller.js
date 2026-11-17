const service = require('./service')
const { ok } = require('../../utils/response')

/** 202 = pekerjaan baru atau masih berjalan; 200 = hasil sudah ada (selesai). */
const request = async (req, res) => {
  const { check } = await service.request(req.db, req.auth, req.valid.params.id, { regenerate: Boolean(req.body && req.body.regenerate) })
  const inProgress = check.status === 'queued' || check.status === 'processing'
  return ok(res, service.serialize(check), { status: inProgress ? 202 : 200 })
}

const get = async (req, res) => ok(res, await service.get(req.db, req.auth, req.valid.params.id))

module.exports = { request, get }
