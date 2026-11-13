const express = require('express')
const { apiLimiter } = require('../middlewares/rate-limit')

const router = express.Router()

router.use(apiLimiter)

/*
 * Semua endpoint aplikasi driver ada di bawah /api/v1.
 * Kontrak lengkap: /documentation (src/static/index.js).
 *
 * Satu modul = satu folder di src/modules/<nama>/ berisi:
 *   index.js       -> router (path + middleware)
 *   validation.js  -> skema Joi
 *   controller.js  -> baca req, panggil service, kirim response
 *   service.js     -> aturan bisnis, lempar AppError
 *   repository.js  -> query knex
 */

router.use(require('../modules/app'))
router.use('/auth', require('../modules/auth'))
router.use('/me', require('../modules/me'))
router.use('/devices', require('../modules/devices'))
router.use('/media', require('../modules/media'))
router.use('/sync', require('../modules/sync'))
router.use('/drivers', require('../modules/drivers'))
router.use('/users', require('../modules/users'))
router.use('/roles', require('../modules/roles'))
router.use('/unit-types', require('../modules/unit-types'))
router.use('/units', require('../modules/units'))
router.use('/customers', require('../modules/customers'))
router.use('/locations', require('../modules/locations'))
router.use('/unit-assignments', require('../modules/unit-assignments'))
router.use('/expenses', require('../modules/expenses/manage-index'))
router.use('/settlements', require('../modules/settlements'))
router.use('/p2h-items', require('../modules/p2h-items'))
router.use('/expense-categories', require('../modules/expense-categories'))
router.use('/settings', require('../modules/settings'))
router.use('/delivery-orders', require('../modules/delivery-orders'))
router.use('/delivery-orders', require('../modules/loading'))
router.use('/delivery-orders', require('../modules/odometer'))
router.use('/delivery-orders', require('../modules/expenses'))
router.use('/delivery-orders', require('../modules/handover'))
router.use('/delivery-orders', require('../modules/progress'))
router.use('/delivery-orders', require('../modules/summary'))
router.use(require('../modules/p2h')) // /p2h/template, /units/:unitId/p2h...

module.exports = router
