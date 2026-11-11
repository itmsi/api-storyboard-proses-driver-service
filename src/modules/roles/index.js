const express = require('express')
const { adminGuard } = require('../../middlewares/admin-guard')
const { permit } = require('../../middlewares/permit')
const { validate } = require('../../middlewares/validate')
const { asyncHandler } = require('../../utils/response')
const schema = require('./validation')
const controller = require('./controller')

const router = express.Router()

// Di-mount di /roles (khusus admin dengan hak modul "roles")
router.use(adminGuard)
router.use(permit('roles'))

// Daftar modul dan aksi yang bisa diberikan (untuk menggambar matriks hak di layar)
router.get('/catalog', asyncHandler(controller.catalog))
router.post('/get', validate({ body: schema.list }), asyncHandler(controller.list))
router.post('/', validate({ body: schema.create }), asyncHandler(controller.create))
router.get('/:id', validate({ params: schema.idParams }), asyncHandler(controller.get))
router.put('/:id', validate({ params: schema.idParams, body: schema.update }), asyncHandler(controller.update))
router.delete('/:id', validate({ params: schema.idParams }), asyncHandler(controller.remove))

module.exports = router
