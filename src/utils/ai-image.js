const sharp = require('sharp')
const config = require('../config')
const storage = require('./storage')
const { AiError } = require('./ai-error')

/**
 * Siapkan foto untuk dikirim ke AI: dikirim APA ADANYA (byte demi byte, tanpa diperkecil atau disandikan ulang) selama formatnya
 * JPEG, PNG, atau WebP dan ukurannya di bawah batas OpenAI (AI_IMAGE_MAX_BYTES). Angka kecil di layar dashboard paling mudah rusak
 * oleh pengecilan, jadi hanya dua keadaan yang diubah: format yang tidak didukung (mis. HEIC) menjadi JPEG kualitas tinggi tanpa
 * pengecilan, dan file yang melebihi batas ukuran dikecilkan secukupnya (sisi terpanjang maksimal AI_IMAGE_MAX_SIDE).
 *
 * @param {Buffer} buffer
 * @returns {Promise<{ buffer: Buffer, mime: string, width: number, height: number }>}
 */
const MIME = { jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' }

const prepareImage = async (buffer, {
  maxBytes = config.ai.image.maxBytes, maxSide = config.ai.image.maxSide, quality = config.ai.image.jpegQuality,
} = {}) => {
  try {
    const meta = await sharp(buffer).metadata()
    if (MIME[meta.format] && buffer.length <= maxBytes) {
      return {
        buffer, mime: MIME[meta.format], width: meta.width, height: meta.height,
      }
    }
    // Perlu diubah: putar sesuai EXIF, kecilkan hanya bila file terlalu besar
    let img = sharp(buffer).rotate()
    if (buffer.length > maxBytes) {
      img = img.resize({
        width: maxSide, height: maxSide, fit: 'inside', withoutEnlargement: true,
      })
    }
    const { data, info } = await img.jpeg({ quality }).toBuffer({ resolveWithObject: true })
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
