const express = require('express')
const swaggerUi = require('swagger-ui-express')
const config = require('../config')
const { ok } = require('../utils/response')
const { index: openApiSpec } = require('../static')
const v1 = require('./v1')

const router = express.Router()

router.get('/', (req, res) => ok(res, {
  name: config.app.name,
  env: config.app.env,
  uptime_seconds: Math.round(process.uptime()),
  server_time: new Date().toISOString(),
  documentation: config.app.swaggerEnabled ? '/documentation' : null,
}))

// Dipakai healthcheck Docker / load balancer. Database tiap client dicek saat dipakai
// (error TENANT_UNAVAILABLE), bukan di sini, karena server melayani banyak database.
router.get('/health', (req, res) => {
  res.json({ success: true, data: { status: 'ok', uptime_seconds: Math.round(process.uptime()) } })
})

if (config.app.swaggerEnabled) {
  router.get('/documentation.json', (req, res) => res.json(openApiSpec))
  router.use('/documentation', swaggerUi.serve, swaggerUi.setup(openApiSpec, {
    customSiteTitle: 'OGO Service API',
    swaggerOptions: { persistAuthorization: true, docExpansion: 'none', tagsSorter: 'alpha' },
  }))
}

router.use('/internal', require('../modules/internal'))
// dipanggil saas-worker (X-Internal-Key = INTERNAL_PROVISIONING_KEY)
router.use('/api/v1', v1)

module.exports = router
