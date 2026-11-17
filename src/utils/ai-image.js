const sharp = require('sharp')
const config = require('../config')
const storage = require('./storage')
const { AiError } = require('./ai-error')

/**
 * Siapkan foto untuk dikirim ke AI: foto kecil dan tegak dikirim apa adanya; selain itu putar sesuai EXIF, kecilkan (sisi terpanjang maksimal AI_IMAGE_MAX_SIDE, tanpa memperbesar),
 * simpan sebagai JPEG. Angka di dashboard tetap terbaca di sekitar 1280 px, dan ukuran kiriman (serta biaya token) jauh lebih kecil.
 *
 * @param {Buffer} buffer
 * @returns {Promise<{ buffer: Buffer, mime: 'image/jpeg'|'image/png', width: number, height: number }>}
 */
const prepareImage = async (buffer, { maxSide = config.ai.image.maxSide, quality = config.ai.image.jpegQuality } = {}) => {
  try {
    // Foto yang sudah cukup kecil dan tegak dikirim apa adanya (tanpa kompresi ulang): menyandikan ulang JPEG hanya menambah kerusakan
    // pada angka yang kecil. Hanya foto besar yang dikecilkan, atau yang perlu diputar sesuai EXIF.
    const meta = await sharp(buffer).metadata()
    const upright = !meta.orientation || meta.orientation === 1
    if (upright && (meta.format === 'jpeg' || meta.format === 'png') && meta.width <= maxSide && meta.height <= maxSide) {
      return {
        buffer, mime: meta.format === 'png' ? 'image/png' : 'image/jpeg', width: meta.width, height: meta.height,
      }
    }
    const { data, info } = await sharp(buffer)
      .rotate()
      .resize({
        width: maxSide, height: maxSide, fit: 'inside', withoutEnlargement: true,
      })
      .jpeg({ quality })
      .toBuffer({ resolveWithObject: true })
    return {
      buffer: data, mime: 'image/jpeg', width: info.width, height: info.height,
    }
  } catch (err) {
    throw new AiError('ai_bad_image', { message: 'File bukan gambar yang bisa dibaca.' })
  }
}

/**
 * Ambil foto dari penyimpanan (Nextcloud/S3, lewat kredensial server, bukan link publik) lalu siapkan untuk AI.
 * @param {string} storageKey  kunci file, mis. media.storage_key
 */
const loadImageForAi = async (storageKey) => {
  let buffer
  try {
    buffer = await storage.getObjectBuffer(storageKey)
  } catch (err) {
    // Penyimpanan sedang bermasalah: layak dicoba lagi
    throw new AiError('ai_unavailable', { message: 'Gagal mengambil foto dari penyimpanan.', retryable: true })
  }
  if (!buffer) throw new AiError('ai_image_missing', { message: 'Foto tidak ditemukan di penyimpanan.' })
  return prepareImage(buffer)
}

module.exports = { prepareImage, loadImageForAi }
