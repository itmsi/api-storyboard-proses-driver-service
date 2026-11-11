const express = require('express')
const { adminGuard } = require('../../middlewares/admin-guard')
const { permit } = require('../../middlewares/permit')
const { validate } = require('../../middlewares/validate')
const { asyncHandler } = require('../../utils/response')
const schema = require('./validation')
const controller = require('./controller')

const router = express.Router()

// Di-mount di /unit-assignments (khusus admin)
router.use(adminGuard)
router.use(permit('unit_assignments'))

router.post('/get', validate({ body: schema.list }), asyncHandler(controller.list))
// POST dan PUT sama-sama upsert: satu driver satu unit per tanggal (menimpa penugasan yang sudah ada)
router.post('/', validate({ body: schema.assign }), asyncHandler(controller.assign))
router.put('/', validate({ body: schema.assign }), asyncHandler(controller.assign))
router.get('/:id', validate({ params: schema.idParams }), asyncHandler(controller.get))
router.delete('/:id', validate({ params: schema.idParams }), asyncHandler(controller.remove))

module.exports = router
