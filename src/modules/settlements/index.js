const express = require('express')
const { adminGuard } = require('../../middlewares/admin-guard')
const { permit } = require('../../middlewares/permit')
const { validate } = require('../../middlewares/validate')
const { asyncHandler } = require('../../utils/response')
const schema = require('./validation')
const controller = require('./controller')

const router = express.Router()

// Di-mount di /settlements (khusus admin). id di path = id delivery order.
router.use(adminGuard)
router.use(permit('settlements'))

router.post('/get', validate({ body: schema.list }), asyncHandler(controller.list))
router.get('/:id', validate({ params: schema.idParams }), asyncHandler(controller.get))
router.post('/:id/settle', validate({ params: schema.idParams, body: schema.settle }), asyncHandler(controller.settle))

module.exports = router
