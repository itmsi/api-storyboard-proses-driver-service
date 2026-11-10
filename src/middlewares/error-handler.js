const multer = require('multer')
const config = require('../config')
const logger = require('../utils/logger')
const { AppError } = require('../utils/errors')
const { t, resolveLocale } = require('../lang')

const toAppError = (err) => {
  if (err instanceof AppError) return err

  // JSON body rusak / terlalu besar (body-parser)
  if (err.type === 'entity.parse.failed') {
    return new AppError('BAD_REQUEST', { details: { reason: 'invalid_json' } })
  }
  if (err.type === 'entity.too.large') return new AppError('PAYLOAD_TOO_LARGE')

  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return new AppError('PAYLOAD_TOO_LARGE', { details: { max_bytes: config.upload.maxFileSize } })
    }
    return new AppError('VALIDATION_ERROR', { details: [{ field: err.field || 'file', message: err.message }] })
  }

  // Pelanggaran unique constraint Postgres -> 409
  if (err.code === '23505') {
    return new AppError('CONFLICT', { details: { constraint: err.constraint } })
  }

  return null
}

const notFoundHandler = (req, res, next) => {
  next(new AppError('ROUTE_NOT_FOUND', { details: { method: req.method, path: req.originalUrl } }))
}

// eslint-disable-next-line no-unused-vars
const errorHandler = (err, req, res, next) => {
  const appError = toAppError(err)

  if (!appError || appError.httpStatus >= 500) {
    logger.error(`${req.method} ${req.originalUrl} -> ${err.stack || err}`)
  }

  const error = appError || new AppError('INTERNAL_ERROR')
  const locale = resolveLocale(req.headers['accept-language'])

  const body = {
    success: false,
    error: {
      code: error.code,
      message: error.customMessage || t(error.code, locale),
      http_status: error.httpStatus,
    },
  }
  if (error.details !== undefined) body.error.details = error.details
  if (!appError && !config.app.isProduction) body.error.debug = err.message

  res.status(error.httpStatus).json(body)
}

module.exports = { notFoundHandler, errorHandler }
