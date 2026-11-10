const express = require('express')
const { authenticate, authorize } = require('../../middlewares/auth')
const { asyncHandler } = require('../../utils/response')
const controller = require('./controller')

const router = express.Router()

// GET /api/v1/config/public  (tanpa token)
router.get('/config/public', controller.getPublicConfig)

// GET /api/v1/config
router.get('/config', authenticate, authorize('driver'), asyncHandler(controller.getConfig))

// GET /api/v1/app/bootstrap
router.get('/app/bootstrap', authenticate, authorize('driver'), asyncHandler(controller.getBootstrap))

module.exports = router
