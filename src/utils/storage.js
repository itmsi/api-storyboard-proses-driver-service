/**
 * Penyimpanan file media (foto odometer, struk, muatan, surat jalan, dll).
 *
 * STORAGE_DRIVER=nextcloud -> Nextcloud lewat WebDAV (NEXTCLOUD_*); file disajikan API di /storage (lihat getNextcloud)
 * STORAGE_DRIVER=s3        -> MinIO / S3-compatible (bucket S3_BUCKET)
 */
const config = require('../config')
const logger = require('./logger')
const { AppError } = require('./errors')

let s3Client

const getS3 = () => {
  if (!s3Client) {
    // eslint-disable-next-line global-require
    const Minio = require('minio')
    const { s3 } = config.storage
    s3Client = new Minio.Client({
      endPoint: s3.endPoint,
      port: s3.port,
      useSSL: s3.useSSL,
      accessKey: s3.accessKey,
      secretKey: s3.secretKey,
      region: s3.region,
    })
  }
  return s3Client
}

// ---------- Nextcloud (WebDAV) ----------

const nextcloudAuth = () => {
  const { username, password } = config.storage.nextcloud
  return `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`
}

/** URL WebDAV file: <NEXTCLOUD_URL><webdav>/<uploadDir>/<key>, tiap segmen di-encode. */
const nextcloudUrl = (key) => {
  const nc = config.storage.nextcloud
  const segments = [...nc.uploadDir.split('/'), ...key.split('/')].filter(Boolean).map(encodeURIComponent)
  return `${nc.url}${nc.webdavPath}/${segments.join('/')}`
}

const ncRequest = async (method, url, { body, headers } = {}) => {
  const nc = config.storage.nextcloud
  try {
    return await fetch(url, {
      method,
      body,
      headers: { Authorization: nextcloudAuth(), ...headers },
      signal: AbortSignal.timeout(nc.timeoutMs),
    })
  } catch (err) {
    logger.error(`Nextcloud ${method} gagal: ${err.name === 'TimeoutError' ? 'timeout' : (err.cause && err.cause.code) || err.message}`)
    throw new AppError('INTERNAL_ERROR', { details: { reason: 'penyimpanan_tidak_terjangkau' } })
  }
}

const ensuredFolders = new Set() // folder yang sudah dipastikan ada (hemat MKCOL)

/** Buat folder bertingkat (MKCOL per segmen). 201 = dibuat, 405 = sudah ada. */
const ensureFolders = async (key) => {
  const nc = config.storage.nextcloud
  const segments = [...nc.uploadDir.split('/'), ...key.split('/').slice(0, -1)].filter(Boolean)
  let current = ''
  // eslint-disable-next-line no-restricted-syntax
  for (const segment of segments) {
    current = `${current}/${segment}`
    if (!ensuredFolders.has(current)) {
      const url = `${nc.url}${nc.webdavPath}${current.split('/').map((s) => (s ? encodeURIComponent(s) : s)).join('/')}`
      // eslint-disable-next-line no-await-in-loop
      const res = await ncRequest('MKCOL', url)
      if (res.status !== 201 && res.status !== 405) {
        logger.error(`Nextcloud MKCOL ${current} -> HTTP ${res.status}`)
        throw new AppError('INTERNAL_ERROR', { details: { reason: 'penyimpanan_gagal' } })
      }
      ensuredFolders.add(current)
    }
  }
}

const putNextcloud = async (key, buffer, contentType) => {
  await ensureFolders(key)
  const res = await ncRequest('PUT', nextcloudUrl(key), { body: buffer, headers: { 'Content-Type': contentType || 'application/octet-stream' } })
  if (res.status < 200 || res.status >= 300) {
    logger.error(`Nextcloud PUT ${key} -> HTTP ${res.status}`)
    throw new AppError('INTERNAL_ERROR', { details: { reason: 'penyimpanan_gagal' } })
  }
  return key
}

/**
 * Ambil file dari Nextcloud untuk disajikan API (driver nextcloud). null = tidak ada.
 * @returns {Promise<{ body: ReadableStream, contentType: string, contentLength: string|null }|null>}
 */
const getNextcloud = async (key) => {
  const res = await ncRequest('GET', nextcloudUrl(key))
  if (res.status === 404) return null
  if (!res.ok) {
    logger.error(`Nextcloud GET ${key} -> HTTP ${res.status}`)
    throw new AppError('INTERNAL_ERROR', { details: { reason: 'penyimpanan_gagal' } })
  }
  return { body: res.body, contentType: res.headers.get('content-type') || 'application/octet-stream', contentLength: res.headers.get('content-length') }
}

/**
 * @param {string} key          contoh: "media/2026/11/05/<uuid>.jpg"
 * @param {Buffer} buffer
 * @param {string} contentType
 */
const putObject = async (key, buffer, contentType) => {
  if (config.storage.driver === 's3') {
    await getS3().putObject(config.storage.s3.bucket, key, buffer, buffer.length, {
      'Content-Type': contentType,
    })
    return key
  }

  // nextcloud (default)
  return putNextcloud(key, buffer, contentType)
}

/** URL yang dikirim ke aplikasi. Untuk bucket privat ganti dengan presigned URL. */
const publicUrl = (key) => {
  const base = config.storage.publicBaseUrl.replace(/\/$/, '')
  return base ? `${base}/${key}` : `/storage/${key}`
}

const presignedUrl = async (key, expirySeconds = 3600) => {
  if (config.storage.driver !== 's3') return publicUrl(key)
  return getS3().presignedGetObject(config.storage.s3.bucket, key, expirySeconds)
}

module.exports = {
  putObject, publicUrl, presignedUrl, getNextcloud,
}
