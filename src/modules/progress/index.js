const express = require('express')
const { authenticate, authorize } = require('../../middlewares/auth')
const { validate } = require('../../middlewares/validate')
const { driverCan } = require('../../middlewares/permit')
const { asyncHandler } = require('../../utils/response')
const schema = require('./validation')
const controller = require('./controller')

const router = express.Router()

// Di-mount di /delivery-orders. Pembacaan data langkah perjalanan milik driver sendiri (untuk menampilkan ulang di aplikasi);
// hak: driver_delivery_orders:read (sama dengan membaca detail DO). Guard dipasang per route.
const read = [authenticate, authorize('driver'), driverCan('driver_delivery_orders', 'read'), validate({ params: schema.idParams })]

// GET /api/v1/delivery-orders/:id/loading
router.get('/:id/loading', read, asyncHandler(controller.getLoading))

// GET /api/v1/delivery-orders/:id/odometer
router.get('/:id/odometer', read, asyncHandler(controller.getOdometer))

// GET /api/v1/delivery-orders/:id/handover
router.get('/:id/handover', read, asyncHandler(controller.getHandover))

module.exports = router
