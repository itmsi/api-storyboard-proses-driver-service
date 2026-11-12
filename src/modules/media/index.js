const express = require('express')
const { authenticate, authorize } = require('../../middlewares/auth')
const { adminGuard, activeAdminOnly } = require('../../middlewares/admin-guard')
const { can, adminCan, driverCan } = require('../../middlewares/permit')
const { imageUpload } = require('../../middlewares/upload')
const { validate } = require('../../middlewares/validate')
const { asyncHandler } = require('../../utils/response')
const schema = require('./validation')
const controller = require('./controller')

const router = express.Router()

// POST /api/v1/media  (multipart: file, kind, client_ref, captured_at, gps, side)
// Urutan: auth dulu supaya request tanpa token tidak sempat mengupload file.
router.post(
  '/',
  authenticate,
  authorize('driver'),
  driverCan('driver_media', 'create'),
  imageUpload.single('file'),
  validate({ body: schema.upload }),
  asyncHandler(controller.upload)
)

// POST /api/v1/media/get  (admin: daftar dengan filter di body)
router.post('/get', adminGuard, can('media', 'read'), validate({ body: schema.list }), asyncHandler(controller.list))

// GET /api/v1/media/:id  (admin: semua; driver: foto miliknya)
router.get('/:id', authenticate, authorize('driver', 'admin'), activeAdminOnly, adminCan('media', 'read'), driverCan('driver_media', 'read'), validate({ params: schema.idParams }), asyncHandler(controller.get))

// DELETE /api/v1/media/:id  (admin, hapus lunak; ditolak jika masih dipakai)
router.delete('/:id', adminGuard, can('media', 'delete'), validate({ params: schema.idParams }), asyncHandler(controller.remove))

module.exports = router
