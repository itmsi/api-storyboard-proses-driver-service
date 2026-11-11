const express = require('express')
const { authenticate, authorize } = require('../../middlewares/auth')
const { authLimiter } = require('../../middlewares/rate-limit')
const { validate } = require('../../middlewares/validate')
const { asyncHandler } = require('../../utils/response')
const schema = require('./validation')
const controller = require('./controller')

const router = express.Router()

// POST /api/v1/auth/login    (tanpa token; driver dan admin; body: client_code, username, password, device (driver), remember_me)
router.post('/login', authLimiter, validate({ body: schema.login }), asyncHandler(controller.login))

// POST /api/v1/auth/refresh  (tanpa access token; refresh token membawa client code)
router.post('/refresh', authLimiter, validate({ body: schema.refresh }), asyncHandler(controller.refresh))

// POST /api/v1/auth/logout
router.post('/logout', authenticate, authorize('driver', 'admin'), asyncHandler(controller.logout))

module.exports = router
