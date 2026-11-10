const express = require('express')
const { authenticate, authorize } = require('../../middlewares/auth')
const { validate } = require('../../middlewares/validate')
const { asyncHandler } = require('../../utils/response')
const schema = require('./validation')
const controller = require('./controller')

const router = express.Router()

router.use(authenticate, authorize('driver'))

// POST /api/v1/sync/batch
router.post('/batch', validate({ body: schema.batch }), asyncHandler(controller.batch))

module.exports = router
