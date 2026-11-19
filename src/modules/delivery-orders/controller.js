const service = require('./service')
const manage = require('./manage-service')
const { ok, saved } = require('../../utils/response')

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
// Respons simpan/ubah standar (utils/response.saved); detail lengkap diambil lewat GET /delivery-orders/:id
const create = async (req, res) => {
  const row = await manage.create(req.db, req.admin, req.body)
  return saved(res, `DO ${row.no} berhasil dibuat.`, { status: 201 })
}

const update = async (req, res) => {
  const row = await manage.update(req.db, req.admin, req.valid.params.id, req.body)
  return saved(res, `DO ${row.no} berhasil diperbarui.`)
}

const reschedule = async (req, res) => ok(res, await manage.reschedule(req.db, req.admin, req.valid.params.id, req.body), { status: 201 })
const hold = async (req, res) => ok(res, await manage.hold(req.db, req.admin, req.valid.params.id, req.body))

const resume = async (req, res) => ok(res, await manage.resume(req.db, req.admin, req.valid.params.id))

const cancel = async (req, res) => ok(res, await manage.cancel(req.db, req.admin, req.valid.params.id, req.body))

const remove = async (req, res) => {
  const row = await manage.remove(req.db, req.admin, req.valid.params.id)
  return saved(res, `DO ${row.no} berhasil dihapus.`)
}

module.exports = {
  list, getById, active, history, accept, create, reschedule, update, hold, resume, cancel, remove,
}
