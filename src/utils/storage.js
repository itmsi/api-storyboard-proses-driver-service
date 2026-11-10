/**
 * Penyimpanan file media (foto odometer, struk, muatan, surat jalan, dll).
 *
 * STORAGE_DRIVER=local -> disimpan di STORAGE_LOCAL_DIR, disajikan di /storage
 * STORAGE_DRIVER=s3    -> MinIO / S3-compatible (bucket S3_BUCKET)
 */
const fs = require('fs/promises')
const path = require('path')
const config = require('../config')

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

  const target = path.join(config.storage.localDir, key)
  await fs.mkdir(path.dirname(target), { recursive: true })
  await fs.writeFile(target, buffer)
  return key
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

module.exports = { putObject, publicUrl, presignedUrl }
