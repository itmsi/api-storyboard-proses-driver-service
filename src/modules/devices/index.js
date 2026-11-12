const express = require('express')
const { authenticate, authorize } = require('../../middlewares/auth')
const { validate } = require('../../middlewares/validate')
const { driverCan } = require('../../middlewares/permit')
const { asyncHandler } = require('../../utils/response')
const schema = require('./validation')
const controller = require('./controller')

const router = express.Router()

router.use(authenticate, authorize('driver'))

// POST /api/v1/devices/push-token
router.post('/push-token', driverCan('driver_device', 'create'), validate({ body: schema.pushToken }), asyncHandler(controller.registerPushToken))

module.exports = router
