const express = require('express')
const { authenticate, authorize } = require('../../middlewares/auth')
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
  imageUpload.single('file'),
  validate({ body: schema.upload }),
  asyncHandler(controller.upload)
)

module.exports = router
