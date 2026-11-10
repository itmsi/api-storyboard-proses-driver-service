const express = require('express')
const { authenticate, authorize } = require('../../middlewares/auth')
const { validate } = require('../../middlewares/validate')
const { asyncHandler } = require('../../utils/response')
const schema = require('./validation')
const controller = require('./controller')

const router = express.Router()

// Dipasang per route (bukan router.use) karena router ini di-mount di root /api/v1
const guard = [authenticate, authorize('driver')]

// GET /api/v1/p2h/template
router.get('/p2h/template', guard, asyncHandler(controller.getTemplate))

// GET /api/v1/units/:unitId/p2h/today
router.get('/units/:unitId/p2h/today', guard, validate({ params: schema.unitParams }), asyncHandler(controller.getToday))

// POST /api/v1/units/:unitId/p2h
router.post(
  '/units/:unitId/p2h',
  guard,
  validate({ params: schema.unitParams, body: schema.submit }),
  asyncHandler(controller.submit)
)

module.exports = router
