const service = require('./service')
const { ok } = require('../../utils/response')
const { serializeMedia } = require('./serializer')

const upload = async (req, res) => {
  const { media, created } = await service.upload(req.db, req.auth, req.file, req.body)
  return ok(res, serializeMedia(media), { status: created ? 201 : 200 })
}

module.exports = { upload }
