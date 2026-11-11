const express = require('express')
const { adminGuard } = require('../../middlewares/admin-guard')
const { validate } = require('../../middlewares/validate')
const { asyncHandler } = require('../../utils/response')
const schema = require('./validation')
const controller = require('./controller')

const router = express.Router()

// Di-mount di /users (akun admin perusahaan; khusus admin)
router.use(adminGuard)

router.post('/get', validate({ body: schema.list }), asyncHandler(controller.list))
router.post('/', validate({ body: schema.create }), asyncHandler(controller.create))
router.get('/:id', validate({ params: schema.idParams }), asyncHandler(controller.get))
router.put('/:id', validate({ params: schema.idParams, body: schema.update }), asyncHandler(controller.update))
router.post('/:id/reset-password', validate({ params: schema.idParams, body: schema.resetPassword }), asyncHandler(controller.resetPassword))
router.delete('/:id', validate({ params: schema.idParams }), asyncHandler(controller.remove))

module.exports = router
