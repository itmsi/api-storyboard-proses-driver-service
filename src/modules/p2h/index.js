const express = require('express')
const { authenticate, authorize } = require('../../middlewares/auth')
const { adminGuard, activeAdminOnly } = require('../../middlewares/admin-guard')
const {
  can, adminCan, driverCan,
} = require('../../middlewares/permit')
const { validate } = require('../../middlewares/validate')
const { asyncHandler } = require('../../utils/response')
const schema = require('./validation')
const controller = require('./controller')

const router = express.Router()

// Dipasang per route (bukan router.use) karena router ini di-mount di root /api/v1
const guard = [authenticate, authorize('driver')]
// Endpoint baca yang juga boleh dipakai admin (hak p2h:read); driver tetap dicek hak driver_p2h:read
const readGuard = [authenticate, authorize('driver', 'admin'), activeAdminOnly, adminCan('p2h', 'read'), driverCan('driver_p2h', 'read')]

// GET /api/v1/p2h/template
router.get('/p2h/template', readGuard, asyncHandler(controller.getTemplate))

// GET /api/v1/units/:unitId/p2h/today
//   driver: unit yang ditugaskan kepadanya hari ini | admin: unit mana pun (hak p2h:read)
router.get('/units/:unitId/p2h/today', readGuard, validate({ params: schema.unitParams }), asyncHandler(controller.getToday))

// POST /api/v1/units/:unitId/p2h
router.post(
  '/units/:unitId/p2h',
  guard,
  driverCan('driver_p2h', 'create'),
  validate({ params: schema.unitParams, body: schema.submit }),
  asyncHandler(controller.submit)
)

// POST /api/v1/units/:unitId/p2h/recheck  (khusus admin: minta P2H ulang)
router.post(
  '/units/:unitId/p2h/recheck',
  adminGuard,
  can('p2h', 'update'),
  validate({ params: schema.unitParams, body: schema.recheck }),
  asyncHandler(controller.recheck)
)

// Admin: kelola P2H (daftar, detail, koreksi, hapus lunak). Router di-mount di root, jadi guard dipasang per route.
router.post('/p2h/get', adminGuard, can('p2h', 'read'), validate({ body: schema.list }), asyncHandler(controller.list))
router.get('/p2h/:id', adminGuard, can('p2h', 'read'), validate({ params: schema.idParams }), asyncHandler(controller.get))
router.put('/p2h/:id', adminGuard, can('p2h', 'update'), validate({ params: schema.idParams, body: schema.update }), asyncHandler(controller.update))
router.delete('/p2h/:id', adminGuard, can('p2h', 'delete'), validate({ params: schema.idParams }), asyncHandler(controller.remove))

module.exports = router
