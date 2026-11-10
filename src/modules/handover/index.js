const express = require('express')
const { authenticate, authorize } = require('../../middlewares/auth')
const { validate } = require('../../middlewares/validate')
const { asyncHandler } = require('../../utils/response')
const schema = require('./validation')
const controller = require('./controller')

const router = express.Router()

// Di-mount di /delivery-orders; guard dipasang per route
const guard = [authenticate, authorize('driver')]

// POST /api/v1/delivery-orders/:id/handover
router.post('/:id/handover', guard, validate({ params: schema.idParams, body: schema.handover }), asyncHandler(controller.create))

module.exports = router
