/**
 * Error aplikasi. Lempar AppError dari service/controller, error handler
 * akan mengubahnya menjadi format kontrak:
 *
 * { "success": false, "error": { "code", "message", "http_status", "details" } }
 */

const ERROR_STATUS = {
  BAD_REQUEST: 400,
  VALIDATION_ERROR: 422,
  UNAUTHORIZED: 401,
  TOKEN_EXPIRED: 401,
  INVALID_CREDENTIALS: 401,
  ACCOUNT_LOCKED: 423,
  INVALID_CLIENT_CODE: 401,
  CLIENT_INACTIVE: 403,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  ROUTE_NOT_FOUND: 404,
  CONFLICT: 409,
  INVALID_STATE: 409,
  P2H_REQUIRED: 409,
  DUPLICATE_RECEIPT: 409,
  DO_LOCKED: 409,
  DO_CANCELLED: 409,
  PAYLOAD_TOO_LARGE: 413,
  UNSUPPORTED_MEDIA_TYPE: 415,
  APP_UPDATE_REQUIRED: 426,
  RATE_LIMITED: 429,
  INTERNAL_ERROR: 500,
  MAINTENANCE: 503,
  TENANT_UNAVAILABLE: 503,
  MIGRATION_IN_PROGRESS: 409,
  MIGRATION_FAILED: 500,
}

class AppError extends Error {
  /**
   * @param {keyof ERROR_STATUS} code  kode error (lihat ERROR_STATUS)
   * @param {object} [options]
   * @param {string} [options.message]  pesan khusus; default diambil dari src/lang
   * @param {object|Array} [options.details]
   * @param {number} [options.httpStatus]
   */
  constructor(code, { message, details, httpStatus } = {}) {
    super(message || code)
    this.name = 'AppError'
    this.code = code
    this.customMessage = message
    this.details = details
    this.httpStatus = httpStatus || ERROR_STATUS[code] || 500
  }
}

module.exports = { AppError, ERROR_STATUS }
