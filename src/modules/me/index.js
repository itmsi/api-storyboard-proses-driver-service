const express = require('express')
const { authenticate, authorize } = require('../../middlewares/auth')
const { validate } = require('../../middlewares/validate')
const { asyncHandler } = require('../../utils/response')
const schema = require('./validation')
const controller = require('./controller')

const router = express.Router()

router.use(authenticate, authorize('driver'))

// GET /api/v1/me
router.get('/', asyncHandler(controller.getMe))

// PATCH /api/v1/me/settings
router.patch('/settings', validate({ body: schema.settings }), asyncHandler(controller.updateSettings))

module.exports = router
