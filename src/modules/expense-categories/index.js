const express = require('express')
const { adminGuard } = require('../../middlewares/admin-guard')
const { permit } = require('../../middlewares/permit')
const { validate } = require('../../middlewares/validate')
const { asyncHandler } = require('../../utils/response')
const schema = require('./validation')
const controller = require('./controller')

const router = express.Router()

// Di-mount di /expense-categories (khusus admin). DELETE = soft delete (biaya lama tetap merujuk kategori ini).
router.use(adminGuard)
router.use(permit('expense_categories'))

router.post('/get', validate({ body: schema.list }), asyncHandler(controller.list))
router.post('/', validate({ body: schema.create }), asyncHandler(controller.create))
router.get('/:code', validate({ params: schema.codeParams }), asyncHandler(controller.get))
router.put('/:code', validate({ params: schema.codeParams, body: schema.update }), asyncHandler(controller.update))
router.delete('/:code', validate({ params: schema.codeParams }), asyncHandler(controller.remove))

module.exports = router
