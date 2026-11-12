const express = require('express')
const { authenticate, authorize } = require('../../middlewares/auth')
const { validate } = require('../../middlewares/validate')
const { driverCan } = require('../../middlewares/permit')
const { asyncHandler } = require('../../utils/response')
const schema = require('./validation')
const controller = require('./controller')

const router = express.Router()

// Di-mount di /delivery-orders; guard dipasang per route
const guard = [authenticate, authorize('driver')]

// GET /api/v1/delivery-orders/:id/summary
router.get('/:id/summary', guard, driverCan('driver_delivery_orders', 'read'), validate({ params: schema.idParams }), asyncHandler(controller.getSummary))

// POST /api/v1/delivery-orders/:id/complete
router.post('/:id/complete', guard, driverCan('driver_delivery_orders', 'update'), validate({ params: schema.idParams, body: schema.complete }), asyncHandler(controller.complete))

module.exports = router
