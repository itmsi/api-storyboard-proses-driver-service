const path = require('path')

require('dotenv').config({ path: path.join(__dirname, '../../.env') })

const str = (key, fallback = '') => {
  const value = process.env[key]
  return value === undefined || value === '' ? fallback : value
}
const num = (key, fallback) => {
  const value = Number(process.env[key])
  return Number.isFinite(value) && process.env[key] !== '' ? value : fallback
}
const bool = (key, fallback = false) => {
  const value = process.env[key]
  if (value === undefined || value === '') return fallback
  return ['true', '1', 'yes'].includes(value.toLowerCase())
}
const list = (key, fallback = []) => {
  const value = process.env[key]
  if (!value) return fallback
  return value.split(',').map((v) => v.trim()).filter(Boolean)
}

const env = str('NODE_ENV', 'development')
const isProduction = env === 'production'

const config = {
  app: {
    name: str('APP_NAME', 'OGO Service API'),
    env,
    isProduction,
    port: num('APP_PORT', 9060),
    timezone: str('TZ', 'Asia/Jakarta'),
    jsonLimit: str('JSON_LIMIT', '1mb'),
    corsOrigins: list('CORS_ORIGINS', ['*']),
    defaultLanguage: str('DEFAULT_LANGUAGE', 'id'),
    swaggerEnabled: bool('SWAGGER_ENABLED', !isProduction),
  },

  db: {
    client: 'pg',
    connection: {
      host: str('DB_HOST', 'localhost'),
      port: num('DB_PORT', 5432),
      user: str('DB_USER', 'postgres'),
      password: str('DB_PASSWORD', ''),
      database: str('DB_NAME', 'ogo_service'),
      ssl: bool('DB_SSL', false) ? { rejectUnauthorized: false } : false,
      application_name: 'api-ogo-service',
    },
    pool: {
      min: num('DB_POOL_MIN', 0),
      max: num('DB_POOL_MAX', 10),
    },
  },

  jwt: {
    secret: str('JWT_SECRET'),
    accessTokenTtl: num('JWT_ACCESS_TTL', 86400), // detik (24 jam)
    refreshTokenTtl: num('JWT_REFRESH_TTL', 2592000), // detik (30 hari)
  },

  auth: {
    maxLoginAttempts: num('AUTH_MAX_LOGIN_ATTEMPTS', 5),
    bcryptRounds: num('BCRYPT_ROUNDS', 12),
  },

  upload: {
    maxFileSize: num('UPLOAD_MAX_FILE_SIZE', 10 * 1024 * 1024),
    allowedMimeTypes: list('UPLOAD_ALLOWED_TYPES', ['image/jpeg', 'image/png']),
  },

  storage: {
    driver: str('STORAGE_DRIVER', 'local'), // local | s3
    localDir: path.resolve(str('STORAGE_LOCAL_DIR', 'storage')),
    publicBaseUrl: str('STORAGE_PUBLIC_BASE_URL', ''),
    s3: {
      endPoint: str('S3_ENDPOINT', 'localhost'),
      port: num('S3_PORT', 9000),
      useSSL: bool('S3_USE_SSL', false),
      accessKey: str('S3_ACCESS_KEY'),
      secretKey: str('S3_SECRET_KEY'),
      bucket: str('S3_BUCKET', 'ogo-media'),
      region: str('S3_REGION', 'us-east-1'),
    },
  },

  // Nilai untuk GET /config/public (dibaca aplikasi Android sebelum login)
  mobile: {
    languages: list('APP_LANGUAGES', ['id', 'en', 'zh']),
    minAppVersion: str('MOBILE_MIN_APP_VERSION', '1.0.0'),
    latestAppVersion: str('MOBILE_LATEST_APP_VERSION', '1.0.0'),
    updateUrl: str('MOBILE_UPDATE_URL', ''),
    maintenance: bool('MAINTENANCE_MODE', false),
    maintenanceMessage: str('MAINTENANCE_MESSAGE', '') || null,
    supportLabel: str('SUPPORT_LABEL', 'Hubungi admin OGO'),
    supportPhone: str('SUPPORT_PHONE', ''),
  },
}

if (isProduction && !config.jwt.secret) {
  throw new Error('JWT_SECRET wajib diisi saat NODE_ENV=production')
}
if (!config.jwt.secret) {
  config.jwt.secret = 'dev-only-insecure-secret'
}

module.exports = config
