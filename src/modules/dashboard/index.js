const express = require('express')
const { adminGuard } = require('../../middlewares/admin-guard')
const { permit } = require('../../middlewares/permit')
const { validate } = require('../../middlewares/validate')
const { asyncHandler } = require('../../utils/response')
const schema = require('./validation')
const controller = require('./controller')

const router = express.Router()

// Di-mount di /dashboard (khusus admin). POST /get = read.
router.use(adminGuard)
router.use(permit('dashboard'))

// POST /api/v1/dashboard/get  (ringkasan operasional + daftar DO pada rentang start_date..end_date)
router.post('/get', validate({ body: schema.get }), asyncHandler(controller.get))

module.exports = router
