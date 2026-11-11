const provisioner = require('../../database/tenant/provisioner')
const { ok } = require('../../utils/response')

const migrate = async (req, res) => ok(res, await provisioner.migrate(req.valid.params.client_id))

const seed = async (req, res) => ok(res, await provisioner.seed(req.valid.params.client_id, { includeSystemUser: req.body.include_system_user }))

const verify = async (req, res) => ok(res, await provisioner.verify(req.valid.params.client_id))

const resetSystemUser = async (req, res) => ok(res, await provisioner.resetSystemUser(req.valid.params.client_id))

const migrationStatus = async (req, res) => ok(res, provisioner.status())

module.exports = {
  migrate, seed, verify, resetSystemUser, migrationStatus,
}
