const express = require('express')
const { authenticate, authorize } = require('../../middlewares/auth')
const { activeAdminOnly } = require('../../middlewares/admin-guard')
const { adminCan, driverCan } = require('../../middlewares/permit')
const { validate } = require('../../middlewares/validate')
const { asyncHandler } = require('../../utils/response')
const schema = require('./validation')
const controller = require('./controller')

const router = express.Router()

// Di-mount di /ai-checks. Permintaan pengecekannya sendiri: POST /media/:id/ai-check (lihat modul media).
// GET /ai-checks/:id  (driver: miliknya, hak driver_ai_check:read; admin: semua, hak media:read)
router.get(
  '/:id',
  authenticate,
  authorize('driver', 'admin'),
  activeAdminOnly,
  adminCan('media', 'read'),
  driverCan('driver_ai_check', 'read'),
  validate({ params: schema.idParams }),
  asyncHandler(controller.get)
)

module.exports = router
