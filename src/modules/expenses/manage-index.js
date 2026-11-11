const express = require('express')
const { adminGuard } = require('../../middlewares/admin-guard')
const { validate } = require('../../middlewares/validate')
const { asyncHandler } = require('../../utils/response')
const schema = require('./manage-validation')
const controller = require('./manage-controller')

const router = express.Router()

// Di-mount di /expenses (khusus admin). Pencatatan biaya oleh driver ada di index.js (/delivery-orders/:id/expenses).
router.use(adminGuard)

router.get('/', validate({ query: schema.list }), asyncHandler(controller.list))
router.get('/:id', validate({ params: schema.idParams }), asyncHandler(controller.get))
router.post('/:id/void', validate({ params: schema.idParams, body: schema.voidExpense }), asyncHandler(controller.voidExpense))

module.exports = router
