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

  // Multi-tenant: satu database per client (client code). Kredensial dikelola saas-api (control plane).
  tenant: {
    // env = daftar tenant dari .env (dev/test); remote = resolve ke saas-api (produksi)
    registry: str('TENANT_REGISTRY', 'env'),
    // Password DB tenant dari saas-api terenkripsi AES-256-GCM; key HARUS sama dengan TENANT_DB_ENC_KEY di saas-api
    encKey: str('TENANT_DB_ENC_KEY'),
    encKeyVersion: num('TENANT_DB_ENC_KEY_VERSION', 1),
    // Akun admin bawaan MSI (mode env/dev saja; di mode remote username dan password dari saas-api)
    devSystemUsername: str('TENANT_DEV_SYSTEM_USERNAME', 'msi.support'),
    devSystemPassword: str('TENANT_DEV_SYSTEM_PASSWORD', 'DevSupport-1234'),
    devCode: str('TENANT_DEV_CODE', 'OGO'),
    devName: str('TENANT_DEV_NAME', 'PT Owngo Logistics Indonesia'),
    devTenantsJson: str('TENANTS_JSON'), // opsional: JSON array tenant dev lebih dari satu
    resolveTtlMs: num('TENANT_RESOLVE_TTL', 300) * 1000, // cache hasil resolve kredensial
    poolMax: num('TENANT_POOL_MAX', 5), // koneksi maksimum per tenant
    maxPools: num('TENANT_MAX_POOLS', 50), // jumlah tenant yang boleh terkoneksi bersamaan
  },

  // saas-api (control plane): sumber kredensial DB tiap client
  saas: {
    apiUrl: str('SAAS_API_INTERNAL_URL', 'http://localhost:9061/internal').replace(/\/$/, ''),
    timeoutMs: num('SAAS_TIMEOUT_MS', 5000),
  },

  // Kunci antar-layanan (sama dengan di saas-api).
  //   apiKey          -> dikirim API ini ke saas-api untuk resolve tenant biasa (role app)
  //   provisioningKey -> dikirim ke saas-api untuk resolve scope=provisioning (role owner), DAN kunci yang
  //                      wajib dibawa saas-worker saat memanggil endpoint /internal API ini. Kosong = /internal mati.
  internal: {
    apiKey: str('INTERNAL_API_KEY'),
    provisioningKey: str('INTERNAL_PROVISIONING_KEY'),
  },

  jwt: {
    secret: str('JWT_SECRET'),
    accessTokenTtl: num('JWT_ACCESS_TTL', 86400), // detik (24 jam)
    refreshTokenTtl: num('JWT_REFRESH_TTL', 2592000), // detik (30 hari), remember_me = true
    refreshTokenTtlShort: num('JWT_REFRESH_TTL_SHORT', 86400), // detik (1 hari), remember_me = false
  },

  auth: {
    lockMinutes: num('AUTH_LOCK_MINUTES', 15),
    maxLoginAttempts: num('AUTH_MAX_LOGIN_ATTEMPTS', 5),
    bcryptRounds: num('BCRYPT_ROUNDS', 12),
  },

  upload: {
    maxFileSize: num('UPLOAD_MAX_SIZE', 10 * 1024 * 1024), // 10mb:10485760 20mb:20971520 50mb:52428800
    allowedMimeTypes: list('UPLOAD_ALLOWED_TYPES', ['image/jpeg', 'image/png']),
  },

  storage: {
    driver: str('STORAGE_DRIVER', 'nextcloud'), // nextcloud | s3
    publicBaseUrl: str('STORAGE_PUBLIC_BASE_URL', ''),
    nextcloud: {
      url: str('NEXTCLOUD_URL').replace(/\/+$/, ''),
      username: str('NEXTCLOUD_USERNAME'),
      password: str('NEXTCLOUD_PASSWORD'),
      // Alamat Nextcloud yang bisa dibuka pengguna untuk link share (kosong = sama dengan NEXTCLOUD_URL; isi bila API memakai alamat internal)
      publicUrl: str('NEXTCLOUD_PUBLIC_URL', '').replace(/\/+$/, ''),
      // Endpoint OCS untuk membuat link share publik
      shareApiPath: `/${str('NEXTCLOUD_SHARE_API_PATH', '/ocs/v1.php/apps/files_sharing/api/v1/shares').replace(/^\/+|\/+$/g, '')}`,
      webdavPath: `/${str('NEXTCLOUD_WEBDAV_PATH', '/remote.php/webdav').replace(/^\/+|\/+$/g, '')}`,
      uploadDir: `/${str('NEXTCLOUD_UPLOAD_DIR', '/OGO-Driver').replace(/^\/+|\/+$/g, '')}`,
      timeoutMs: num('NEXTCLOUD_TIMEOUT_MS', 30000),
    },
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

  // Pengecekan foto dengan AI (OpenAI). API key BUKAN di sini: satu key per client, disimpan di database client (app_settings).
  ai: {
    enabled: bool('AI_ENABLED', false),
    openai: {
      baseUrl: str('OPENAI_BASE_URL', 'https://api.openai.com/v1').replace(/\/+$/, ''),
      visionModel: str('OPENAI_VISION_MODEL', 'gpt-4o-mini'),
      timeoutMs: num('OPENAI_TIMEOUT_MS', 30000),
      // Batas token keluaran. Model penalaran (mis. seri o dan gpt-5) memakai token ini juga untuk "berpikir": bila terlalu kecil, seluruhnya
      // habis dan jawaban kosong. Model biasa hanya memakai puluhan token, jadi batas besar tidak menambah biaya.
      maxCompletionTokens: num('OPENAI_MAX_COMPLETION_TOKENS', 4000),
      // Upaya penalaran (minimal | low | medium | high) untuk model penalaran: lebih rendah = lebih cepat dan murah. Kosong = tidak dikirim
      // (wajib kosong untuk model biasa seperti gpt-4o-mini, yang menolak parameter ini).
      reasoningEffort: str('OPENAI_REASONING_EFFORT'),
    },
    image: {
      maxBytes: num('AI_IMAGE_MAX_BYTES', 15 * 1024 * 1024), // di atas ini foto dikecilkan; di bawahnya dikirim apa adanya (batas OpenAI 20 MB)
      maxSide: num('AI_IMAGE_MAX_SIDE', 2048), // sisi terpanjang bila foto terpaksa dikecilkan (px)
      jpegQuality: num('AI_IMAGE_QUALITY', 80),
    },
    maxChecksPerHour: num('AI_MAX_CHECKS_PER_HOUR', 60), // batas permintaan pengecekan per driver per jam (pelindung biaya)
    // Antrean pekerjaan (RabbitMQ; broker yang sama dengan saas-api, hanya nama antrean yang berbeda)
    queue: {
      enabled: bool('RABBITMQ_ENABLED', true), // false = tidak menyambung ke RabbitMQ sama sekali (permintaan hanya menunggu di database)
      url: str('RABBITMQ_URL'),
      name: str('RABBITMQ_QUEUE_NAME', str('AI_QUEUE_NAME', 'logistics-ai-check')), // AI_QUEUE_NAME dipertahankan sebagai nama lama
      worker: bool('AI_WORKER_ENABLED', true), // proses ini ikut memproses antrean (false = hanya menerbitkan pesan)
      concurrency: num('AI_QUEUE_CONCURRENCY', 2), // pekerjaan yang diproses bersamaan per proses
      maxAttempts: num('AI_MAX_ATTEMPTS', 3),
      retryDelaysMs: list('AI_RETRY_DELAYS_MS', ['10000', '30000', '120000']).map(Number).filter((n) => Number.isFinite(n) && n > 0), // jeda sebelum percobaan ulang ke-1, ke-2, ...
      staleQueuedMs: num('AI_STALE_QUEUED_MS', 60 * 1000), // pekerjaan baru (belum pernah diambil worker) yang menunggu selama ini dianggap pesannya tidak sampai ke antrean
      staleMs: num('AI_STALE_MS', 5 * 60 * 1000), // pekerjaan queued/processing yang tak bergerak selama ini dianggap tersangkut dan diterbitkan ulang
      sweepIntervalMs: num('AI_SWEEP_INTERVAL_MS', 60 * 1000),
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
    supportLabel: str('SUPPORT_LABEL', 'Hubungi admin'),
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
