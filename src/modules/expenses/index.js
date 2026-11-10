const express = require('express')
const { authenticate, authorize } = require('../../middlewares/auth')
const { validate } = require('../../middlewares/validate')
const { asyncHandler } = require('../../utils/response')
const schema = require('./validation')
const controller = require('./controller')

const router = express.Router()

// Di-mount di /delivery-orders; guard dipasang per route
const guard = [authenticate, authorize('driver')]

// GET /api/v1/delivery-orders/:id/expenses
router.get('/:id/expenses', guard, validate({ params: schema.idParams }), asyncHandler(controller.list))

// POST /api/v1/delivery-orders/:id/expenses
router.post('/:id/expenses', guard, validate({ params: schema.idParams, body: schema.create }), asyncHandler(controller.create))

module.exports = router
