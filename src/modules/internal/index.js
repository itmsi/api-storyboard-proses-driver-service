const express = require('express')
const { internalAuth } = require('../../middlewares/internal-auth')
const { validate } = require('../../middlewares/validate')
const { asyncHandler } = require('../../utils/response')
const schema = require('./validation')
const controller = require('./controller')

const router = express.Router()

router.use(internalAuth)

// Dipanggil saas-worker (di-mount di /internal, tanpa /api/v1)
router.get('/migrations/status', asyncHandler(controller.migrationStatus))
router.post('/tenants/:client_id/migrate', validate({ params: schema.clientParams }), asyncHandler(controller.migrate))
router.post('/tenants/:client_id/seed', validate({ params: schema.clientParams, body: schema.seedBody }), asyncHandler(controller.seed))
router.get('/tenants/:client_id/verify', validate({ params: schema.clientParams }), asyncHandler(controller.verify))
router.post('/tenants/:client_id/system-user/reset', validate({ params: schema.clientParams }), asyncHandler(controller.resetSystemUser))

module.exports = router
