const express = require('express')
const { authenticate, authorize } = require('../../middlewares/auth')
const { adminGuard, activeAdminOnly } = require('../../middlewares/admin-guard')
const { byRole } = require('../../middlewares/by-role')
const { validate } = require('../../middlewares/validate')
const { asyncHandler } = require('../../utils/response')
const schema = require('./validation')
const manageSchema = require('./manage-validation')
const controller = require('./controller')

const router = express.Router()

// Guard dipasang per route karena router lain (loading, odometer, ...) berbagi prefix /delivery-orders
const driverOnly = [authenticate, authorize('driver')]
const anyRole = [authenticate, authorize('driver', 'admin'), activeAdminOnly]

// GET /api/v1/delivery-orders
//   driver: DO miliknya (?status=assigned)   |   admin: semua DO, dengan pagination dan filter
router.get('/', anyRole, byRole({
  driver: [validate({ query: schema.listQuery })],
  admin: [validate({ query: manageSchema.list })],
}), asyncHandler(controller.list))

// POST /api/v1/delivery-orders  (admin membuat dan menugaskan DO)
router.post('/', adminGuard, validate({ body: manageSchema.create }), asyncHandler(controller.create))

// Path tetap harus didaftarkan SEBELUM '/:id'
router.get('/active', driverOnly, asyncHandler(controller.active))
router.get('/history', driverOnly, validate({ query: schema.historyQuery }), asyncHandler(controller.history))

// GET /api/v1/delivery-orders/:id   (driver: DO miliknya; admin: detail lengkap beserta linimasa)
router.get('/:id', anyRole, validate({ params: schema.idParams }), asyncHandler(controller.getById))

// Khusus admin
router.put('/:id', adminGuard, validate({ params: schema.idParams, body: manageSchema.update }), asyncHandler(controller.update))
router.post('/:id/cancel', adminGuard, validate({ params: schema.idParams, body: manageSchema.cancel }), asyncHandler(controller.cancel))

// Khusus driver
router.post('/:id/accept', driverOnly, validate({ params: schema.idParams, body: schema.accept }), asyncHandler(controller.accept))

module.exports = router
