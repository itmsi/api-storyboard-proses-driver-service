const express = require('express')
const { authenticate, authorize } = require('../../middlewares/auth')
const { validate } = require('../../middlewares/validate')
const { asyncHandler } = require('../../utils/response')
const schema = require('./validation')
const controller = require('./controller')

const router = express.Router()

router.use(authenticate, authorize('driver'))

// GET /api/v1/delivery-orders?status=assigned
router.get('/', validate({ query: schema.listQuery }), asyncHandler(controller.list))

// Path tetap harus didaftarkan SEBELUM '/:id'
router.get('/active', asyncHandler(controller.active))
router.get('/history', validate({ query: schema.historyQuery }), asyncHandler(controller.history))

router.get('/:id', validate({ params: schema.idParams }), asyncHandler(controller.getById))

router.post('/:id/accept', validate({ params: schema.idParams, body: schema.accept }), asyncHandler(controller.accept))

module.exports = router
