const config = require('./config')
const logger = require('./utils/logger')
const tenant = require('./database/tenant')
const app = require('./app')
const aiChecks = require('./modules/ai-checks/bootstrap')

const server = app.listen(config.app.port, () => {
  logger.info(`${config.app.name} (${config.app.env}) listening on port ${config.app.port}`)
  if (config.app.swaggerEnabled) {
    logger.info(`Swagger: http://localhost:${config.app.port}/documentation`)
  }
})

// Antrean pengecekan AI (pengirim pesan dan worker); gagal terhubung tidak menjatuhkan server
let aiQueue = { stop: async () => {} }
aiChecks.start().then((started) => { aiQueue = started }).catch((err) => logger.error(`Antrean pengecekan AI gagal dipasang: ${err.message}`))

let shuttingDown = false
const shutdown = (signal, exitCode = 0) => {
  if (shuttingDown) return
  shuttingDown = true
  logger.info(`${signal} diterima, menutup server...`)

  server.close(async () => {
    await aiQueue.stop().catch(() => {})
    await tenant.closeAll().catch(() => {})
    logger.info('Server ditutup')
    process.exit(exitCode)
  })

  // Paksa keluar jika request lama tidak selesai
  setTimeout(() => process.exit(1), 10000).unref()
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))

process.on('unhandledRejection', (reason) => {
  logger.error(`Unhandled rejection: ${reason?.stack || reason}`)
})
process.on('uncaughtException', (err) => {
  logger.error(`Uncaught exception: ${err.stack || err}`)
  shutdown('uncaughtException', 1)
})
