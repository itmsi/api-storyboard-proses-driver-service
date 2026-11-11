const express = require('express')
const { adminGuard } = require('../../middlewares/admin-guard')
const { permit } = require('../../middlewares/permit')
const { validate } = require('../../middlewares/validate')
const { asyncHandler } = require('../../utils/response')
const schema = require('./validation')
const controller = require('./controller')

const router = express.Router()

// Di-mount di /settings (khusus admin)
router.use(adminGuard)
router.use(permit('settings'))

router.get('/', asyncHandler(controller.get))
router.put('/', validate({ body: schema.update }), asyncHandler(controller.update))

module.exports = router
