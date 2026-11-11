const express = require('express')
const { adminGuard } = require('../../middlewares/admin-guard')
const { permit } = require('../../middlewares/permit')
const { validate } = require('../../middlewares/validate')
const { asyncHandler } = require('../../utils/response')
const schema = require('./validation')
const controller = require('./controller')

const router = express.Router()

// Di-mount di /units (khusus admin). Guard dipasang per route (bukan router.use) karena aplikasi driver
// memakai path di bawah /units juga (/units/:unitId/p2h), yang ditangani modul p2h.
router.post('/get', adminGuard, permit('units'), validate({ body: schema.list }), asyncHandler(controller.list))
router.post('/', adminGuard, permit('units'), validate({ body: schema.create }), asyncHandler(controller.create))
router.get('/:id', adminGuard, permit('units'), validate({ params: schema.idParams }), asyncHandler(controller.get))
router.put('/:id', adminGuard, permit('units'), validate({ params: schema.idParams, body: schema.update }), asyncHandler(controller.update))
router.delete('/:id', adminGuard, permit('units'), validate({ params: schema.idParams }), asyncHandler(controller.remove))

module.exports = router
