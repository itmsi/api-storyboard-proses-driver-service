const express = require('express')
const { authenticate, authorize } = require('../../middlewares/auth')
const { validate } = require('../../middlewares/validate')
const { asyncHandler } = require('../../utils/response')
const schema = require('./validation')
const controller = require('./controller')

const router = express.Router()

// Di-mount di /delivery-orders; guard dipasang per route
const guard = [authenticate, authorize('driver')]

// POST /api/v1/delivery-orders/:id/odometer
router.post('/:id/odometer', guard, validate({ params: schema.idParams, body: schema.odometer }), asyncHandler(controller.create))

module.exports = router
