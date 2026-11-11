const express = require('express')
const { authenticate, authorize } = require('../../middlewares/auth')
const { activeAdminOnly } = require('../../middlewares/admin-guard')
const { validate } = require('../../middlewares/validate')
const { asyncHandler } = require('../../utils/response')
const schema = require('./validation')
const controller = require('./controller')

const router = express.Router()

// Berlaku untuk driver dan admin; akun admin dicek masih aktif di setiap request (sama seperti endpoint admin lain)
router.use(authenticate, authorize('driver', 'admin'), activeAdminOnly)

// GET /api/v1/me  (bentuk response mengikuti peran: driver atau admin)
router.get('/', asyncHandler(controller.getMe))

// PUT /api/v1/me/settings
router.put('/settings', validate({ body: schema.settings }), asyncHandler(controller.updateSettings))

// POST /api/v1/me/password
router.post('/password', validate({ body: schema.changePassword }), asyncHandler(controller.changePassword))

module.exports = router
