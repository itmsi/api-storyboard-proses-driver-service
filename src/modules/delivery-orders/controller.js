const service = require('./service')
const manage = require('./manage-service')
const { ok } = require('../../utils/response')

const isAdmin = (req) => req.auth.role === 'admin'

// GET / dan GET /:id dipakai driver dan admin: isinya mengikuti peran
const list = async (req, res) => {
  if (isAdmin(req)) {
    const { data, meta } = await manage.list(req.db, req.body)
    return ok(res, data, { meta })
  }
  const { data, meta } = await service.listAssigned(req.db, req.auth, req.body.status)
  return ok(res, data, { meta })
}

const getById = async (req, res) => {
  if (isAdmin(req)) return ok(res, await manage.get(req.db, req.valid.params.id))
  return ok(res, await service.getById(req.db, req.auth, req.valid.params.id))
}

const active = async (req, res) => {
  const { data, meta } = await service.listActive(req.db, req.auth)
  return ok(res, data, { meta })
}

const history = async (req, res) => {
  const { data, meta } = await service.history(req.db, req.auth, req.body)
  return ok(res, data, { meta })
}

const accept = async (req, res) => {
  const { result } = await service.accept(req.db, req.auth, req.valid.params.id, req.body)
  return ok(res, result)
}

// Khusus admin
const create = async (req, res) => ok(res, await manage.create(req.db, req.admin, req.body), { status: 201 })

const update = async (req, res) => ok(res, await manage.update(req.db, req.admin, req.valid.params.id, req.body))

const cancel = async (req, res) => ok(res, await manage.cancel(req.db, req.admin, req.valid.params.id, req.body))

module.exports = {
  list, getById, active, history, accept, create, update, cancel,
}
