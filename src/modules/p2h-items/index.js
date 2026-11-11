const express = require('express')
const { adminGuard } = require('../../middlewares/admin-guard')
const { validate } = require('../../middlewares/validate')
const { asyncHandler } = require('../../utils/response')
const schema = require('./validation')
const controller = require('./controller')

const router = express.Router()

// Di-mount di /p2h-items (khusus admin). Tidak ada DELETE: item dinonaktifkan lewat is_active.
router.use(adminGuard)

router.post('/get', validate({ body: schema.list }), asyncHandler(controller.list))
router.post('/', validate({ body: schema.create }), asyncHandler(controller.create))
router.get('/:code', validate({ params: schema.codeParams }), asyncHandler(controller.get))
router.put('/:code', validate({ params: schema.codeParams, body: schema.update }), asyncHandler(controller.update))

module.exports = router
