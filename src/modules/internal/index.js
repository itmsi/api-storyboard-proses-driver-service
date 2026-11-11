const express = require('express')
const { internalAuth } = require('../../middlewares/internal-auth')
const { validate } = require('../../middlewares/validate')
const { asyncHandler } = require('../../utils/response')
const schema = require('./validation')
const controller = require('./controller')

const router = express.Router()

router.use(internalAuth)

// POST /api/v1/internal/tenants/:clientCode/migrate
router.post('/tenants/:clientCode/migrate', validate({ params: schema.clientParams }), asyncHandler(controller.migrate))

// GET /api/v1/internal/tenants/:clientCode/migration-status
router.get('/tenants/:clientCode/migration-status', validate({ params: schema.clientParams }), asyncHandler(controller.migrationStatus))

// POST /api/v1/internal/tenants/:clientCode/bootstrap-admin  (admin pertama perusahaan)
router.post(
  '/tenants/:clientCode/bootstrap-admin',
  validate({ params: schema.clientParams, body: schema.bootstrapAdmin }),
  asyncHandler(controller.createFirstAdmin)
)

module.exports = router
