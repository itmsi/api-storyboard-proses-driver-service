const config = require('./config')
const logger = require('./utils/logger')
const db = require('./database')
const app = require('./app')

const server = app.listen(config.app.port, () => {
  logger.info(`${config.app.name} (${config.app.env}) listening on port ${config.app.port}`)
  if (config.app.swaggerEnabled) {
    logger.info(`Swagger: http://localhost:${config.app.port}/documentation`)
  }
})

let shuttingDown = false
const shutdown = (signal, exitCode = 0) => {
  if (shuttingDown) return
  shuttingDown = true
  logger.info(`${signal} diterima, menutup server...`)

  server.close(async () => {
    await db.destroy().catch(() => {})
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
