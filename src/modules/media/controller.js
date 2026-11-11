const service = require('./service')
const { ok } = require('../../utils/response')
const { serializeMedia } = require('./serializer')

const upload = async (req, res) => {
  const { media, created } = await service.upload(req.db, req.auth, req.file, req.body)
  return ok(res, serializeMedia(media), { status: created ? 201 : 200 })
}

const list = async (req, res) => {
  const { data, meta } = await service.list(req.db, req.body)
  return ok(res, data, { meta })
}

const get = async (req, res) => ok(res, await service.get(req.db, req.auth, req.valid.params.id))

const remove = async (req, res) => ok(res, await service.remove(req.db, req.admin, req.valid.params.id))

module.exports = {
  upload, list, get, remove,
}
