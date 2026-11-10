const express = require('express')
const helmet = require('helmet')
const cors = require('cors')
const compression = require('compression')
const morgan = require('morgan')
const config = require('./config')
const routes = require('./routes')
const { notFoundHandler, errorHandler } = require('./middlewares/error-handler')

const app = express()

app.set('trust proxy', 1) // di belakang nginx / cloudflare tunnel
app.disable('x-powered-by')

// CSP dimatikan agar Swagger UI di /documentation bisa memuat asetnya
app.use(helmet({ contentSecurityPolicy: false }))
app.use(cors({
  origin: config.app.corsOrigins.includes('*') ? '*' : config.app.corsOrigins,
}))
app.use(compression())
app.use(express.json({ limit: config.app.jsonLimit }))
app.use(express.urlencoded({ extended: true, limit: config.app.jsonLimit }))
app.use(morgan(config.app.isProduction ? 'combined' : 'dev', {
  skip: (req) => req.path === '/health',
}))

if (config.storage.driver === 'local') {
  app.use('/storage', express.static(config.storage.localDir, { maxAge: '7d', index: false }))
}

app.use(routes)

app.use(notFoundHandler)
app.use(errorHandler)

module.exports = app
