const express = require('express')
const controller = require('./controller')

const router = express.Router()

// GET /api/v1/config/public  (tanpa token)
router.get('/config/public', controller.getPublicConfig)

// TODO setelah skema DB final:
// router.get('/config', authenticate, asyncHandler(controller.getConfig))
// router.get('/app/bootstrap', authenticate, asyncHandler(controller.bootstrap))

module.exports = router
