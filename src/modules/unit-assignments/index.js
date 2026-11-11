const express = require('express')
const { adminGuard } = require('../../middlewares/admin-guard')
const { validate } = require('../../middlewares/validate')
const { asyncHandler } = require('../../utils/response')
const schema = require('./validation')
const controller = require('./controller')

const router = express.Router()

// Di-mount di /unit-assignments (khusus admin)
router.use(adminGuard)

router.post('/get', validate({ body: schema.list }), asyncHandler(controller.list))
router.put('/', validate({ body: schema.assign }), asyncHandler(controller.assign))
router.get('/:id', validate({ params: schema.idParams }), asyncHandler(controller.get))
router.delete('/:id', validate({ params: schema.idParams }), asyncHandler(controller.remove))

module.exports = router
